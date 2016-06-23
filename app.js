var newrelic = require('newrelic');
var path = require('path');
var fs = require('fs');
var express = require('express');
var superagent = require('superagent');
var multer  = require('multer');
var plist = require('plist');
var extract = require('extract-zip');
var B = require('bluebird');
var checkDomain = require('./checkDomain');
var config = require('./config');
var childProcess = require('child_process');
var morgan = require('morgan');
var winston = require('winston');

var port = process.env.PORT || config.server.port || 3000;
var app = express();
var uploadDir = 'tmp-app-files';
var upload = multer({ dest: uploadDir });

app.use(morgan('tiny'));
app.use('/static', express.static('static'));
app.use('/', express.static('static'));

app.post('/domain/:domain', function (httpReq, httpResp) {
    var domain = httpReq.params.domain;
    var bundleIdentifier = httpReq.query.bundleIdentifier;
    var teamIdentifier = httpReq.query.teamIdentifier;
    var allowUnencrypted = httpReq.query.allowUnencrypted === 'true'; // F Javascript.
    var respObj = { domains: { } };

    return checkDomain(domain, bundleIdentifier, teamIdentifier, allowUnencrypted)
        .then(function(results) {
            respObj.domains[domain] = results;

            httpResp.status(200).json(respObj);
        })
        .catch(function(errorObj) {
            respObj.domains[domain] = { errors: errorObj };

            httpResp.status(400).json(respObj);
        });
});

function _checkAssociatedDomain(associatedDomain, bundleIdentifier, teamIdentifier, respObj) {
    var domain = associatedDomain.substring(9);

    return checkDomain(domain, bundleIdentifier, teamIdentifier)
        .then(function(results) {
            respObj.domains[domain] = results;
        })
        .catch(function(errorObj) {
            hasBadValue = true;
            respObj.domains[domain] = { errors: errorObj };
        });
}

function _cleanupAppFiles(ipaFile, extractedAppDir) {
    childProcess.exec('rm -rf ' + ipaFile + ' ' + extractedAppDir);
}

function _getAssociatedDomains(entitlementsFile) {
    return new B(function(resolve, reject) {
        try {
            var entitlements = plist.parse(fs.readFileSync(entitlementsFile, 'utf8'));
            resolve(entitlements['com.apple.developer.associated-domains']);
        }
        catch (e) {
            reject(e);
        }
    });
}

function _getApplicationIdentifier(provisionFile) {
    return new B(function(resolve, reject) {
        childProcess.exec('openssl smime -verify -inform DER -noverify -in ' + provisionFile, function(err, stdOut, stderr) {
            if (err) {
                reject(err);
            }
            else {
                var provision = plist.parse(stdOut);
                resolve(provision.Entitlements['application-identifier']);
            }
        });
    });
}

app.post('/app/:appname', upload.single('ipa'), function(httpReq, httpResp) {
    var ipa = httpReq.file;
    var appname = httpReq.params.appname || ipa.originalname.replace('.ipa', '');
    var extractDir = path.join(uploadDir, appname);
    var entitlementsFile = path.join(extractDir, 'Payload', appname + '.app', 'archived-expanded-entitlements.xcent');
    var provisionFile = path.join(extractDir, 'Payload', appname + '.app', 'embedded.mobileprovision');
    var respObj = { appInfo: { errors: { } }, domains: { } };

    winston.info('Starting app extract for', appname);
    extract(ipa.path, { dir: extractDir }, function(err) {
        if (err) {
            respObj.appInfo.errors.failedToExtract = true;
            httpResp.status(400).json(respObj);
            _cleanupAppFiles(ipa.path, extractDir);
            return;
        }

        respObj.appInfo.errors.failedToExtract = false;

        var domainsPromise = _getAssociatedDomains(entitlementsFile);
        var bundleIdentifierPromise = _getApplicationIdentifier(provisionFile);

        B.all([ domainsPromise, bundleIdentifierPromise ])
            .spread(function(associatedDomains, applicationIdentifier ) {
                respObj.appInfo.errors.failedToLoadEntitlements = false;

                if (!associatedDomains || !associatedDomains.length) {
                    respObj.appInfo.errors.missingAssociatedDomain = true
                    httpResp.status(400).json(respObj);
                    _cleanupAppFiles(ipa.path, extractDir);
                    return;
                }

                var applicationIdentifierPieces = applicationIdentifier.split('.');
                var teamIdentifier = applicationIdentifierPieces.shift();
                var bundleIdentifier = applicationIdentifierPieces.join('.');

                respObj.appInfo.errors = undefined;
                var domainPromises = [];
                var hasBadValue = false;

                for (var i = 0; i < associatedDomains.length; i++) {
                    var associatedDomain = associatedDomains[i];

                    if (!/applinks:.*?/.test(associatedDomain)) {
                        hasBadValue = true;
                        respObj.domains[associatedDomain] = { malformed: true };
                    }
                    else {
                        domainPromises.push(_checkAssociatedDomain(associatedDomain, bundleIdentifier, teamIdentifier, respObj));
                    }
                }

                return B.all(domainPromises).then(function() {
                    if (!hasBadValue) {
                        httpResp.status(200);
                    }
                    else {
                        httpResp.status(400);
                    }

                    httpResp.json(respObj);
                    _cleanupAppFiles(ipa.path, extractDir);
                });
            })
            .catch(function() {
                respObj.appInfo.errors.failedToLoadEntitlements = true;
                httpResp.status(400).json(respObj);
                _cleanupAppFiles(ipa.path, extractDir);
            });
    });
});

var server = app.listen(port, function() {
    winston.info('Server running on port ' + port);
});
