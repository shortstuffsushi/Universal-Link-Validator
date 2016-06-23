var B = require('bluebird');
var superagent = require('superagent');
var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');
var winston = require('winston');

// Override the default behavior of superagent, which encodes to UTF-8.
var _parse = function(res, done) {
    res.text = '';
    res.setEncoding('binary');
    res.on('data', function(chunk) { res.text += chunk; });
    res.on('end', done);
};

function _verifyJsonFormat(aasa) {
    winston.info('Verifying JSON contents');

    var applinks = aasa.applinks;
    if (!applinks) {
        winston.info('Missing applinks region');
        return false;
    }

    var details = applinks.details;
    if (!details) {
        winston.info('Missing applinks/details region');
        return false;
    }

    // Domains are an array: [ { appID: '01234567890.com.foo.FooApp', paths: [ '*' ] } ]
    if (details instanceof Array) {
        for (var i = 0; i < details.length; i++) {
            var domain = details[i];
            if (!(typeof domain.appID === 'string' && domain.paths instanceof Array)) {
                winston.info('Invalid detail format for details as array');
                return false;
            }
        }
    }
    // Domains are an object: { '01234567890.com.foo.FooApp': { paths: [ '*' ] } }
    else {
        for (var domain in details) {
            if (!(details[domain].paths instanceof Array)) {
                winston.info('Invalid detail format for details as object');
                return false;
            }
        }
    }

    winston.info('JSON contents are valid');
    return true;
}

function _verifyBundleIdentifierIsPresent(aasa, bundleIdentifier, teamIdentifier) {
    winston.info('Searching for team and bundle id');

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
                winston.info('Team/Bundle found for team for details as array');
                return true;
            }
        }
    }
    // Domains are an object: { '01234567890.com.foo.FooApp': { paths: [ '*' ] } }
    else {
        for (var domain in details) {
            if (identifierRegex.test(domain) && details[domain].paths instanceof Array) {
                winston.info('Team/Bundle found for team for details as object');
                return true;
            }
        }
    }

    winston.info('Team/Bundle not found in AASA');
    return false;
}

function _evaluateAASA(content, bundleIdentifier, teamIdentifier, encrypted) {
    return new B(function(resolve, reject) {
        try {
            winston.info('Trying to parse AASA content');
            var domainAASAValue = JSON.parse(content);

            // Make sure format is good.
            var jsonValidationResult = _verifyJsonFormat(domainAASAValue);

            // Only check bundle identifier if json is good and a bundle identifier to test against is present
            var bundleIdentifierResult;
            if (jsonValidationResult && bundleIdentifier) {
                bundleIdentifierResult = _verifyBundleIdentifierIsPresent(domainAASAValue, bundleIdentifier, teamIdentifier);
            }

            resolve({ encrypted: encrypted, aasa: domainAASAValue, jsonValid: jsonValidationResult, bundleIdentifierFound: bundleIdentifierResult });
        }
        catch (e) {
            winston.info('Failed to parse AASA content');
            reject(e);
        }
    });
}

function _writeAASAContentsToDiskAndValidate(writePath, content, bundleIdentifier, teamIdentifier) {
    return new B(function(resolve, reject) {
        // Write the file to disk. Probably don't actually *need* to do this,
        // but I haven't figured out how to provide it to the process' stdin.
        fs.writeFile(writePath, content, { encoding: 'binary' }, function(err) {
            // TODO handle this as a 500 on our end
            if (err) {
                winston.error('Failed to write aasa file to disk: ', err);
                reject({ opensslVerifyFailed: true });
                return;
            }

            // Now the fun part -- actually read the contents of the aasa file and verify they are properly formatted.
            // Note, some people are hosting *TONS* of these items, which results in large stdOut buffer. To make this
            // work for most cases, I've upped the buffer from 200kb default to 1mb. This still won't handle all cases,
            // but I think it'll cover a reasonable amount.
            childProcess.exec('openssl smime -verify -inform DER -noverify -in ' + writePath, { maxBuffer: 1024 * 1024 }, function(err, stdOut, stderr) {
                if (err) {
                    winston.info(err);
                    winston.info('Failed to parse aasa file: ', stderr);
                    reject({ opensslVerifyFailed: true });
                }
                else {
                    return _evaluateAASA(stdOut, bundleIdentifier, teamIdentifier, true)
                        .then(resolve)
                        .catch(function() {
                            reject({ opensslVerifyFailed: false, invalidJson: true });
                        });
                }

                // Cleanup. Don't wait for this.
                fs.unlink(writePath);
            });
        });
    });
}

function _makeRequest(url) {
    return new B(function(resolve, reject) {
        winston.debug('Superagent request to', url);

        superagent
            .get(url)
            .redirects(0)
            .buffer()
            .parse(_parse)
            .end(function(err, res) {
                winston.debug('Superagent request to', url, 'completed');

                if (err && !res) {
                    var errorObj = { };

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
                    resolve(res);
                }
            });
    });
}

function _loadAASAContents(domain) {
    var wellKnownPath = 'https://' + domain + '/.well-known/apple-app-site-association';
    var aasaPath = 'https://' + domain + '/apple-app-site-association';

    return new B(function(resolve, reject) {
        winston.info('Making Well Known request to', wellKnownPath);

        // Try the Well Known path first, which should be the default now
        _makeRequest(wellKnownPath)
            .then(function(res) {
                // Fallback to aasa path in the case that the well known fails (300 means failure as well)
                if (res.status >= 300) {
                    winston.info('Well Known has invalid status, fallback request to', aasaPath);

                    _makeRequest(aasaPath)
                        .then(function(innerRes) {
                            // If we still get an error, we've failed
                            if (innerRes.status >= 400) {
                                winston.info('Fallback has invalid status, sending server error result');

                                reject({
                                    badDns: false,
                                    httpsFailure: false,
                                    serverError: true
                                });
                            }
                            else {
                                winston.info('Fallback lookup successful');
                                resolve(innerRes);
                            }
                        });
                }
                else {
                    winston.info('Well Known lookup successful');
                    resolve(res);
                }
            })
            .catch(reject);
    });
}

function _checkDomain(domain, bundleIdentifier, teamIdentifier, allowUnencrypted) {
    // Clean up domains, removing scheme and path
    var cleanedDomain = domain.replace(/https?:\/\//, '');
    cleanedDomain = cleanedDomain.replace(/\/.*/, '');

    var writePath = path.join('tmp-app-files', cleanedDomain);

    winston.info('Starting domain check for', cleanedDomain);

    return new B(function(resolve, reject) {
        _loadAASAContents(cleanedDomain)
            .then(function(res) {
                winston.info('Evaluating AASA response');

                // If we make it here, we know we have a valid dns and ssl connection, and no server error
                var errorObj = { badDns: false, httpsFailure: false, serverError: false };

                var isEncryptedMimeType = res.headers['content-type'] === 'application/pkcs7-mime';
                var isJsonMimeType = res.headers['content-type'] === 'application/json' || res.headers['content-type'] === 'text/json';
                var isJsonTypeOK = allowUnencrypted && isJsonMimeType; // Only ok if both the "allow" flag is true, and... it's a valid type.

                // No redirects allowed
                if (res.status >= 300) {
                    winston.info('Invalid redirect');
                    errorObj.redirects = true

                    reject(errorObj);
                }
                // Must have content-type of application/pkcs7-mime, or if unencrypted, must be text/json or application/json
                else if (!isEncryptedMimeType && !isJsonTypeOK) {
                    winston.info('Invalid content-type');
                    errorObj.redirects = false;
                    errorObj.badContentType = true;

                    reject(errorObj);
                }
                else {
                    errorObj.redirects = false;
                    errorObj.badContentType = false;

                    if (allowUnencrypted) {
                        winston.info('Unencrypted files are allowed, trying direct evaluation');

                        // Try to decode the JSON right away (this assumes the file is not encrypted)
                        // If it's not encrypted, we'll just return it
                        return _evaluateAASA(res.text, bundleIdentifier, teamIdentifier, false)
                            .then(resolve)
                            .catch(function() { // The file is encrypted. Go through the rest of the process
                                winston.info('Direct evaluation failed, indicating file is possibly encrypyted');
                                return _writeAASAContentsToDiskAndValidate(writePath, res.text, bundleIdentifier, teamIdentifier)
                            })
                            .then(resolve)
                            // Another failure here indicates the file is not valid
                            .catch(function(err) {
                                errorObj.opensslVerifyFailed = err.opensslVerifyFailed;
                                errorObj.invalidJson = err.invalidJson;
                                reject(errorObj);
                            });
                    }
                    else {
                        // Decrypt and evaluate file
                        return _writeAASAContentsToDiskAndValidate(writePath, res.text, bundleIdentifier, teamIdentifier)
                            .then(resolve)
                            .catch(function(err) {
                                errorObj.opensslVerifyFailed = err.opensslVerifyFailed;
                                errorObj.invalidJson = err.invalidJson;
                                reject(errorObj);
                            });
                    }
                }
            })
            .catch(reject);
        });
}

module.exports = _checkDomain;
