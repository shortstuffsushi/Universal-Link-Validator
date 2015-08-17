var express = require('express');
var app = express();
var config = require('./config');
var port = process.env.PORT || config.server.port || 3000;
var superagent = require('superagent');

app.set('view engine', 'jade');
app.set('views', 'jade')
app.use('/static', express.static('static'));

app.get('/', function (req, res) {
    res.render('index');
});

app.post('/domain/:domain', function (httpReq, httpResp) {
    var domain = httpReq.params.domain;
    var fileUrl = 'https://' + domain + '/apple-app-site-association';
    var respObj = {
        badDns: undefined,
        httpsFailure: undefined,
        serverError: undefined,
        redirects: undefined
    };

    superagent
        .get(fileUrl)
        .redirects(0)
        .end(function(err, res) {
            var respCode = 400;

            if (err && !res) {
                // Unable to resolve DNS name
                if (err.code == 'ENOTFOUND') {
                    respObj.badDns = true;
                }
                // Doesn't support HTTPS
                else if (err.code == 'ECONNREFUSED') {
                    respObj.badDns = false;
                    respObj.httpsFailure = true;
                }
                else {
                    console.log(err)
                }
            }
            else {
                respObj.badDns = false;
                respObj.httpsFailure = false;
                respObj.serverError = res.status >= 400;

                if (!respObj.serverError) {
                    respObj.redirects = res.status >= 300;

                    if (!respObj.redirects) {
                        respCode = 200;
                    }
                }
            }

            httpResp.status(respCode).json(respObj);
        });
});

var server = app.listen(port, function() {
    console.log('Server running on port ' + port);
});
