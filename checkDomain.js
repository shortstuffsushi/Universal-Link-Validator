var B = require('bluebird');
var superagent = require('superagent');
var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

// Override the default behavior of superagent, which encodes to UTF-8.
var _parse = function(res, done) {
    res.text = '';
    res.setEncoding('binary');
    res.on('data', function(chunk) { res.text += chunk; });
    res.on('end', done);
};

function _verifyJsonFormat(aasa) {
    var applinks = aasa.applinks;
    if (!applinks) {
        return false;
    }

    var details = applinks.details;
    if (!details) {
        return false;
    }

    // Domains are an array: [ { appID: '01234567890.com.foo.FooApp', paths: [ '*' ] } ]
    if (details instanceof Array) {
        for (var i = 0; i < details.length; i++) {
            var domain = details[i];
            if (!(domain.appID instanceof String && domain.paths instanceof Array)) {
                return false;
            }
        }
    }
    // Domains are an object: { '01234567890.com.foo.FooApp': { paths: [ '*' ] } }
    else {
        for (var domain in details) {
            if (!(details[domain].paths instanceof Array)) {
                return false;
            }
        }
    }

    return true;
}

function _verifyBundleIdentifierIsPresent(aasa, bundleIdentifier, teamIdentifier) {
    var regexString = bundleIdentifier.replace(/\./g, '\\.') + '$';
    if (teamIdentifier) {
        regexString = teamIdentifier + '\\.' + regexString;
    }

    var identifierRegex = new RegExp(regexString);

    var details = aasa.applinks.details;

    // Domains are an array: [ { appID: '01234567890.com.foo.FooApp', paths: [ '*' ] } ]
    if (details instanceof Array) {
        for (var i = 0; i < details.length; i++) {
            var domain = details[i];
            if (identifierRegex.test(domain.appID) && domain.paths instanceof Array) {
                return true;
            }
        }
    }
    // Domains are an object: { '01234567890.com.foo.FooApp': { paths: [ '*' ] } }
    else {
        for (var domain in details) {
            if (identifierRegex.test(domain) && details[domain].paths instanceof Array) {
                return true;
            }
        }
    }

    return false;
}

function _evaluateAASA(content, bundleIdentifier, teamIdentifier, encrypted) {
    return new B(function(resolve, reject) {
        try {
            var domainAASAValue = JSON.parse(content);

            // Make sure format is good.
            var jsonValidationResult = _verifyJsonFormat(domainAASAValue);

            // Only check bundle identifier if json is good and a bundle identifier to test against is present
            var bundleIdentifierResult;
            if (jsonValidationResult && bundleIdentifier) {
                bundleIdentifierResult =_verifyBundleIdentifierIsPresent(domainAASAValue, bundleIdentifier, teamIdentifier);
            }

            resolve({ encrypted: encrypted, aasa: domainAASAValue, jsonValid: jsonValidationResult, bundleIdentifierFound: bundleIdentifierResult });
        }
        catch (e) {
            reject(e);
        }
    });
}

function _checkDomain(domain, bundleIdentifier, teamIdentifier) {
    // Clean up domains, removing scheme and path
    var cleanedDomain = domain.replace(/https?:\/\//, '');
    cleanedDomain = cleanedDomain.replace(/\/.*/, '');

    var fileUrl = 'https://' + cleanedDomain + '/apple-app-site-association';
    var writePath = path.join('tmp-app-files', cleanedDomain);

    return new B(function(resolve, reject) {
        var errorObj = { };

        superagent
            .get(fileUrl)
            .redirects(0)
            .buffer()
            .parse(_parse)
            .end(function(err, res) {
                if (err && !res) {
                    // Unable to resolve DNS name
                    if (err.code == 'ENOTFOUND') {
                        errorObj.badDns = true;
                    }
                    // Doesn't support HTTPS
                    else if (err.code == 'ECONNREFUSED' || /Hostname\/IP doesn't match certificate's altnames/.test(err.message)) {
                        errorObj.badDns = false;
                        errorObj.httpsFailure = true;
                    }
                    else {
                        console.log(err);
                    }

                    reject(errorObj);
                }
                else {
                    errorObj.badDns = false;
                    errorObj.httpsFailure = false;

                    // Bad server response
                    if (res.status >= 400) {
                        errorObj.serverError = true;

                        reject(errorObj);
                    }
                    // No redirects allowed
                    else if (res.status >= 300) {
                        errorObj.serverError = false;
                        errorObj.redirects = true

                        reject(errorObj);
                    }
                    // Must have content-type of application/pkcs7-mime
                    else if (res.headers['content-type'] !== 'application/pkcs7-mime') {
                        errorObj.serverError = false;
                        errorObj.redirects = false;
                        errorObj.badContentType = true;

                        reject(errorObj);
                    }
                    else {
                        errorObj.serverError = false;
                        errorObj.redirects = false;
                        errorObj.badContentType = false;

                        // Try to decode the JSON right away (this assumes the file is not encrypted)
                        _evaluateAASA(res.text, bundleIdentifier, teamIdentifier, false)
                            .then(resolve) // Not encrypted, send it back
                            .catch(function() {// Encrypted, go through the rest of the process
                                // Write the file to disk. Probably don't actually *need* to do this,
                                // but I haven't figured out how to provide it to the process' stdin.
                                fs.writeFile(writePath, res.text, { encoding: 'binary' }, function(err) {
                                    // TODO handle this as a 500 on our end
                                    if (err) {
                                        console.log('Failed to write aasa file to disk: ', err);
                                        errorObj.opensslVerifyFailed = true;
                                        reject(errorObj);
                                        return;
                                    }

                                    // Now the fun part -- actually read the contents of the aasa file and verify they are properly formatted.
                                    childProcess.exec('openssl smime -verify -inform DER -noverify -in ' + writePath, function(err, stdOut, stderr) {
                                        if (err) {
                                            console.log('Failed to parse aasa file: ', stderr);
                                            errorObj.opensslVerifyFailed = true;
                                            reject(errorObj);
                                        }
                                        else {
                                            errorObj.opensslVerifyFailed = false;

                                            _evaluateAASA(stdOut, bundleIdentifier, teamIdentifier, true)
                                                .then(resolve)
                                                .catch(function(e) {
                                                    console.log('Failed to parse:', stdOut, '\n\nError:', e);
                                                    errorObj.invalidJson = true;
                                                    reject(errorObj);
                                                });
                                        }

                                        // Cleanup. Don't wait for this.
                                        fs.unlink(writePath);
                                    });
                                });
                            });
                    }
                }
            });
    });
}

module.exports = _checkDomain;
