
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var dgram = require('dgram');
var uuid = require('uuid/v5');
var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var process = require('process');
var os = require('os');

const serverName = 'Karabako';
const serverWebPort = 6888;
const serverUdpPort = 6879;

////////////////////////////////////////////////////////////////////////////////

var mediaList = [];
var mediaDict = {};

var videoDir = ".";
if (process.argv[2]) {
  videoDir = process.argv[2];
}

var serverAddress = '';
var iface = os.networkInterfaces();
for (x in iface) {
  for (y in iface[x]) {
    if ((iface[x][y].internal != true) &&
        (iface[x][y].family == 'IPv4')) {
      serverAddress = iface[x][y].address;
    }
  }
}

////////////////////////////////////////////////////////////////////////////////

function fileScanner(directory) {
  console.log("Scanning directory: " + directory);
  var files = fs.readdirSync(directory);
  for (x in files) {

    if ((files[x].slice(-4) != ".mp4") &&
        (files[x].slice(-4) != ".mkv")) {
      continue;
    }

    const ffprobe = cp.spawnSync('ffprobe', [path.resolve(directory, files[x])]);
    var matchDur = /Duration: (\d\d):(\d\d):(\d\d)\.(\d\d)/.exec(ffprobe.stderr.toString());
    var matchDim = /(\d\d\d\d)x(\d\d\d\d)/.exec(ffprobe.stderr.toString());
    var duration = (matchDur[1] * 3600000) + (matchDur[2] * 60000) + (matchDur[3] * 1000) + (matchDur[4] * 10);
    var width = matchDim[1]
    var height = matchDim[2]

    var size = fs.statSync(path.resolve(directory, files[x])).size;
    var modified = fs.statSync(path.resolve(directory, files[x])).mtime.getTime();
    var id = uuid(files[x], uuid.DNS).slice(0, 8)

    console.log("Adding: " + files[x] + ", " + duration + " ms, " + width + "x" + height + ", " + size + " bytes, [" + id + "]");

    mediaList.push({
      "id"               : id,
      "name"             : files[x],
      "duration"         : duration,
      "size"             : size,
      "url"              : "http://" + serverAddress + ":" + serverWebPort + "/stream/" + id,
      "thumbnail"        : "http://" + serverAddress + ":" + serverWebPort + "/thumbnail/" + id,
      "thumbnailWidth"   : 186,
      "thumbnailHeight"  : 120,
      "lastModified"     : modified,
      "defaultVRSetting" : 0,
      "userVRSetting"    : 0,
      "width"            : width,
      "height"           : height,
      "orientDegree"     : "0",
      "subtitles"        : [],
    });
    
    mediaDict[id] = {
      "deviceId"         : "???",
      "command"          : "activePlay",
      "id"               : id,
      "exists"           : true,
      "name"             : files[x],
      "size"             : size,
      "duration"         : duration,
      "streamType"       : "RTSP",
      "defaultVRSetting" : 0,
      "userVRSetting"    : 0,
      "streamUrl"        : "rtsp://" + serverAddress + ":8554/test",
      "playTime"         : 0,
      "width"            : width,
      "height"           : height,
      "orientDegree"     : "0",
      "url"              : "http://" + serverAddress + ":" + serverWebPort + "/stream/" + id,
    };
  }
}

fileScanner(videoDir);
if (mediaList.length == 0) {
  console.log("No files found, try specifying a directory with the first argument.");
  process.exit(1);
}

////////////////////////////////////////////////////////////////////////////////

var discovery = dgram.createSocket('udp4');

discovery.on('listening', function() {
  console.log('Discovery server listening on: ' + discovery.address().address + ':' + discovery.address().port);
});

discovery.on('message', function(message, remote) {
  console.log('Discovery query from: ' + remote.address + ':' + remote.port);
  reply = {
    "udp"          : true,
    "project"      : "direwolf server",
    "command"      : "searchResult",
    "deviceId"     : JSON.parse(message).deviceId,
    "computerId"   : uuid(serverName, uuid.DNS),
    "computerName" : serverName,
    "ip"           : serverAddress,
    "port"         : serverWebPort,
  };
  discovery.send(JSON.stringify(reply), remote.port, remote.address)
});

discovery.bind(serverUdpPort);

////////////////////////////////////////////////////////////////////////////////

io.on('connection', function(socket) {
  socket.on('clientMessage', function (message) {

    switch (JSON.parse(message).command) {
    case "addDevice":
      reply = {
        "command"    : "addDeviceResult",
        "success"    : true,
        "isLoggedIn" : true,
      };
      socket.emit('serverMessage', reply);
      console.log("Device connected: " + JSON.parse(message).deviceName);
      break;

    case "getPlayerState":
      reply = { 
        "command"          : "updatePlayerState",
        "state"            : "stopped",
        "showMirrorScreen" : true,
      };
      socket.emit('serverMessage', reply);
      break;

    case "getMediaList":
      reply = {
        "command" : "getMediaListResult",
        "list"    : mediaList,
      };
      socket.emit('serverMessage', reply);
      break;

    case "play":
      reply = mediaDict[JSON.parse(message).id];
      reply["deviceId"] = JSON.parse(message).deviceId;
      socket.emit('serverMessage', reply);
      break;

    case "setTime":
      reply = { 
        "deviceId" : JSON.parse(message).deviceId,
        "command"  : "activeSetTime",
        "time"     : JSON.parse(message).time,
      };
      socket.emit('serverMessage', reply);
      break;

    case "stop":
      reply = { 
        "deviceId" : JSON.parse(message).deviceId,
        "command"  : "activeStop",
      };
      socket.emit('serverMessage', reply);
      break;

    case "pause":
      break;

    case "setVRSetting":
      break;

    case "disconnect":
      socket.disconnect(true);
      break;

    default:
      console.log("Unknown WebSocket message: " + message);
    }
  });
});

app.get('/thumbnail/:id', function (request, response) {
  var movieFileName = mediaDict[request.params.id].name;
  response.sendFile(path.resolve(videoDir, movieFileName + ".png"));
});

app.get('/stream/:id', function (request, response) {

  var movieFileName = mediaDict[request.params.id].name;
  var streamPath = path.resolve(videoDir, movieFileName);
  var size = fs.statSync(streamPath).size;
  var contentType = "video/mp4";

  if (movieFileName.slice(-4) == ".mkv") {
    contentType = "video/x-matroska";
  }

  if (request.headers.range) {
    var range = request.headers.range;
    var parts = range.replace(/bytes=/, "").split("-");
    var partialStart = parts[0];
    var partialEnd = parts[1];
    var start = parseInt(partialStart, 10);
    var end = partialEnd ? parseInt(partialEnd, 10) : size - 1;
    var chunkSize = (end - start) + 1;

    console.log('Sending video: ' + movieFileName + ', range: ' + start + ' - ' + end + ' = ' + chunkSize);
    var file = fs.createReadStream(streamPath, {
      start: start,
      end: end
    });

    response.writeHead(206, {
      'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType
    });
    response.openedFile = file;
    file.pipe(response);

  } else {
    console.log('Sending video: ' + movieFileName + ', all: ' + size);
    var file = fs.createReadStream(streamPath);

    response.writeHead(200, {
      'Content-Length': size,
      'Content-Type': contentType
    });
    response.openedFile = file;
    file.pipe(response);
  }

  response.on('close', function() {
    console.log('Video response closed');
    if (response.openedFile) {
      response.openedFile.unpipe(this);
      if (this.openedFile.fd) {
        fs.close(this.openedFile.fd);
      }
    }
  });
});

http.listen(serverWebPort, serverAddress, function() {
  console.log('Web server listening on: ' + http.address().address + ':' + http.address().port);
});

