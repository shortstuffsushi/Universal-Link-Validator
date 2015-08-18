var B = require('bluebird');
var superagent = require('superagent');

function _checkDomain(domain) {
    var fileUrl = 'https://' + domain + '/apple-app-site-association';

    return new B(function(resolve, reject) {
        var errorObj = { };

        superagent
            .get(fileUrl)
            .redirects(0)
            .end(function(err, res) {
                if (err && !res) {
                    // Unable to resolve DNS name
                    if (err.code == 'ENOTFOUND') {
                        errorObj.badDns = true;
                    }
                    // Doesn't support HTTPS
                    else if (err.code == 'ECONNREFUSED') {
                        errorObj.badDns = false;
                        errorObj.httpsFailure = true;
                    }
                    else {
                        console.log(err)
                    }

                    reject(errorObj);
                }
                else {
                    errorObj.badDns = false;
                    errorObj.httpsFailure = false;

                    if (res.status >= 400) {
                        errorObj.serverError = true;

                        reject(errorObj);
                    }
                    else if (res.status >= 300) {
                        errorObj.serverError = false;
                        errorObj.redirects = true

                        reject(errorObj);
                    }
                    else if (res.headers['content-type'] !== 'application/pkcs7-mime') {
                        errorObj.serverError = false;
                        errorObj.redirects = false;
                        errorObj.badContentType = true;

                        reject(errorObj);
                    }
                    else {
                        resolve();
                    }
                }
            });
    });
}

module.exports = _checkDomain;
