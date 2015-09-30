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

function _checkDomain(domain) {
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
                                    var domainAASAValue = JSON.parse(stdOut);
                                    resolve(domainAASAValue);
                                }

                                // Cleanup. Don't wait for this.
                                fs.unlink(writePath);
                            });
                        });
                    }
                }
            });
    });
}

module.exports = _checkDomain;
