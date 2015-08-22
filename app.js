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

var port = process.env.PORT || config.server.port || 3000;
var app = express();
var uploadDir = './tmp-app-files';
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

app.post('/app', upload.single('ipa'), function(httpReq, httpResp) {
    var ipa = httpReq.file;
    var appName = ipa.originalname.replace('.ipa', '');
    var extractDir = path.join(uploadDir, appName);
    var entitlementsFile = path.join(extractDir, 'Payload', appName + '.app', 'archived-expanded-entitlements.xcent');

    extract(ipa.path, { dir: extractDir }, function(err) {
        if (err) {
            httpResp.status(500).json({ error: 'Failed to extract archive' });
            return;
        }

        var entitlements = plist.parse(fs.readFileSync(entitlementsFile, 'utf8'));
        var associatedDomains = entitlements['com.apple.developer.associated-domains'];

        if (!associatedDomains || !associatedDomains.length) {
            httpResp.status(400).json({ appInfo: { missingAssociatedDomain: true } });
        }
        else {
            var respObj = { appInfo: { missingAssociatedDomain: false }, domains: { } };
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
            });
        }
    });
});

var server = app.listen(port, function() {
    console.log('Server running on port ' + port);
});
