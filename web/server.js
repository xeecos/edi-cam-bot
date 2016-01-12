var childProcess = require('child_process')
  , express = require('express')
  , http = require('http')
  , morgan = require('morgan')
  , ws = require('ws');

// configuration files
var configServer = require('./lib/config/server');

var Galileo = require("galileo-io");
var board = new Galileo();

board.on("ready", function() {
  console.log("READY");
  this.pinMode(3, this.MODES.SERVO);
  this.pinMode(4,this.MODES.OUTPUT);
  this.pinMode(5,this.MODES.PWM);
  this.pinMode(6,this.MODES.PWM);
  this.pinMode(7,this.MODES.OUTPUT);
  this.servoWrite(3, 70);
});
function runSpeed(leftSpeed,rightSpeed){
  board.digitalWrite(4,leftSpeed>0?0:1);
  board.analogWrite(5,leftSpeed<0?-leftSpeed:leftSpeed);
  board.digitalWrite(7,rightSpeed>0?0:1);
  board.analogWrite(6,rightSpeed<0?-rightSpeed:rightSpeed);
}
function forward(){
  runSpeed(-100,-100);
};
function backward(){
  runSpeed(100,100);
};
function turnleft(){
  runSpeed(100,-100);
};
function turnright(){
  runSpeed(-100,100);
};
function doStop(){
  runSpeed(0,0);
};
function runServo(angle){
  angle = 70-Math.floor(angle/1.5);
  board.servoWrite(3, angle);
};
var app = express();
app.set('port', configServer.httpPort);
app.use(express.static(configServer.staticFolder));
app.use(morgan('dev'));
app.post('/post', function (req, res) {
  if(req.query.release!=undefined){
    doStop();
  }
  if(req.query.press!=undefined){
    if(req.query.press>=0&&req.query.press<=3){
      runSpeed(req.query.leftspeed,req.query.rightspeed);
    }
  }
  if(req.query.angle!=undefined){
    runServo(req.query.angle);
  }
  if(req.query.reset!=undefined){
    resetStream();
  }
    res.send('ok');
});

// serve index
require('./lib/routes').serveIndex(app, configServer.staticFolder);

// HTTP server
http.createServer(app).listen(app.get('port'), function () {
  console.log('HTTP server listening on port ' + app.get('port'));
});
var STREAM_MAGIC_BYTES = 'jsmp'; // Must be 4 bytes
var width = 640;
var height = 480;

// WebSocket server
var wsServer = new (ws.Server)({ port: configServer.wsPort });
console.log('WebSocket server listening on port ' + configServer.wsPort);

wsServer.on('connection', function(socket) {
  // Send magic bytes and video size to the newly connected socket
  // struct { char magic[4]; unsigned short width, height;}
  var streamHeader = new Buffer(8);

  streamHeader.write(STREAM_MAGIC_BYTES);
  streamHeader.writeUInt16BE(width, 4);
  streamHeader.writeUInt16BE(height, 6);
  socket.send(streamHeader, { binary: true });

  console.log('New WebSocket Connection (' + wsServer.clients.length + ' total)');

  socket.on('close', function(code, message){
    console.log('Disconnected WebSocket (' + wsServer.clients.length + ' total)');
  });
});

wsServer.broadcast = function(data, opts) {
  for(var i in this.clients) {
    if(this.clients[i].readyState == 1) {
      this.clients[i].send(data, opts);
    }
    else {
      console.log('Error: Client (' + i + ') not connected.');
    }
  }
};
function resetStream(){
  childProcess.exec('../bin/do_ffmpeg.sh');
};
// HTTP server to accept incoming MPEG1 stream
http.createServer(function (req, res) {
  console.log(
    'Stream Connected: ' + req.socket.remoteAddress +
    ':' + req.socket.remotePort + ' size: ' + width + 'x' + height
  );

  req.on('data', function (data) {
    wsServer.broadcast(data, { binary: true });
  });
}).listen(configServer.streamPort, function () {
  console.log('Listening for video stream on port ' + configServer.streamPort);

  // Run do_ffmpeg.sh from node                                                   
  childProcess.exec('../bin/do_ffmpeg.sh');
});

module.exports.app = app;
