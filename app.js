var http = require('http');
var config = require('./config');

var server = http.createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Hello World\n');
});

server.listen(config.server.port, function(e) {
    if (e) {
        console.log('Failed to start server:', e);
        process.exit(1);
    }

    console.log('Server running on port ' + config.server.port);
});
