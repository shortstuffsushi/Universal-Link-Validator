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
var childProcesss = require('child_process');

var port = process.env.PORT || config.server.port || 3000;
var app = express();
var uploadDir = 'tmp-app-files';
var upload = multer({ dest: uploadDir });

app.use('/static', express.static('static'));
app.use('/', express.static('static'));

app.post('/domain/:domain', function (httpReq, httpResp) {
    var domain = httpReq.params.domain;
    var respObj = { domains: { } };

    return checkDomain(domain)
        .then(function(aasa) {
            respObj.domains[domain] = { aasa: aasa };

            httpResp.status(200).json(respObj);
        })
        .catch(function(errorObj) {
            respObj.domains[domain] = { errors: errorObj };

            httpResp.status(400).json(respObj);
        });
});

function _checkAssociatedDomain(associatedDomain, respObj) {
    var domain = associatedDomain.substring(9);

    return checkDomain(domain)
        .then(function(aasa) {
            respObj.domains[domain] = { aasa: aasa };
        })
        .catch(function(errorObj) {
            hasBadValue = true;
            respObj.domains[domain] = { errors: errorObj };
        });
}

function _cleanupAppFiles(ipaFile, extractedAppDir) {
    childProcesss.exec('rm -rf ' + ipaFile + ' ' + extractedAppDir);
}

app.post('/app/:appname', upload.single('ipa'), function(httpReq, httpResp) {
    var ipa = httpReq.file;
    var appname = httpReq.params.appname || ipa.originalname.replace('.ipa', '');
    var extractDir = path.join(uploadDir, appname);
    var entitlementsFile = path.join(extractDir, 'Payload', appname + '.app', 'archived-expanded-entitlements.xcent');
    var respObj = { appInfo: { errors: { } }, domains: { } };

    extract(ipa.path, { dir: extractDir }, function(err) {
        if (err) {
            respObj.appInfo.errors.failedToExtract = true;
            httpResp.status(400).json(respObj);
            _cleanupAppFiles(ipa.path, extractDir);
            return;
        }

        respObj.appInfo.errors.failedToExtract = false;

        var entitlements;
        try {
            entitlements = plist.parse(fs.readFileSync(entitlementsFile, 'utf8'));
        }
        catch (e) {
            respObj.appInfo.errors.failedToLoadEntitlements = true;
            httpResp.status(400).json(respObj);
            _cleanupAppFiles(ipa.path, extractDir);
            return;
        }

        respObj.appInfo.errors.failedToLoadEntitlements = false;

        var associatedDomains = entitlements['com.apple.developer.associated-domains'];

        if (!associatedDomains || !associatedDomains.length) {
            respObj.appInfo.errors.missingAssociatedDomain = true
            httpResp.status(400).json(respObj);
            _cleanupAppFiles(ipa.path, extractDir);
            return;
        }

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
                domainPromises.push(_checkAssociatedDomain(associatedDomain, respObj));
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
    });
});

var server = app.listen(port, function() {
    console.log('Server running on port ' + port);
});
