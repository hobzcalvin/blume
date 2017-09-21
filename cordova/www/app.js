// Route all console logs to Evothings studio log
if (window.hyper && window.hyper.log) { console.log = hyper.log; };

document.addEventListener('deviceready', function() {
  window.codePush.sync();
  if (window.device.platform === 'iOS' && window.device.model === 'x86_64') {
    debugMode();
  } else {
    evothings.scriptsLoaded(app.initialize);
  }
});
document.addEventListener("resume", function() {
  window.codePush.sync();
});

var app = {};

app.DFRBLU_SERVICE_UUID = '0000dfb0-0000-1000-8000-00805f9b34fb';
app.DFRBLU_CHAR_RXTX_UUID = '0000dfb1-0000-1000-8000-00805f9b34fb';
app.PAINT_DIR = 'img/paint/'

var pendingSends = 0;
var sendOneMore = false;

var speedSlider = document.getElementById('movement_speed');
var sizeSlider = document.getElementById('movement_size');
var imgWidthSlider = document.getElementById('img_width_slider');

function sendColor() {
  if (!app.initialized) {
    return;
  }
  if (pendingSends) {
    sendOneMore = true;
    return;
  }
  var color = $("#picker").spectrum("get");
  var hsv = color.toHsv();
  hsv.h = Math.round(hsv.h / 360.0 * 255.0);
  hsv.s = Math.round(hsv.s * 255.0);
  hsv.v = Math.round(hsv.v * 255.0);
  var rainbows = $('#rainbows').is(':checked');
  var speed = parseInt(speedSlider.noUiSlider.get());
  var size = parseInt(sizeSlider.noUiSlider.get());
  if ($('#movement').is(':checked')) {
    app.sendCommand(null, hsv.v, 'M', hsv.h, hsv.s,
      speed + (
        rainbows ? 101 : 0),
      size + (
        $('#movement_vertical').is(':checked') ? 0 : 101));
  } else {
    app.sendCommand(null, hsv.v, rainbows ? 'R' : 'C', hsv.h, hsv.s);
  }
};

sendImage = function(file) {
  if (pendingSends) {
    // Don't send another one here; it's expensive. Just ignore.
    return;
  }
  var brightness = Math.round($("#picker").spectrum("get").toHsv().v * 255.0);
  var frameTime = parseInt(imgWidthSlider.noUiSlider.get());
  if (!file) {
    // No file specified: just tell poi new brightness/frame-time
    app.sendCommand(null, brightness, 'P', 0, frameTime);
    return;
  }

  var img = new Image();
  img.src = file;
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  img.onload = function() {
    // TODO: Avoid recomputing all this stuff for 2 (poi) devices
    // of the same dimensions.
    for (var i in app.devices) {
      var dev = app.devices[i];
      if (!dev.isConnected() || !dev.height || !dev.maxFrames
          || dev.width !== 1) {
        console.log("Skipping disconnected or non-POV device", dev);
        continue;
      }
      var width = Math.min(
        dev.maxFrames,
        Math.round(img.naturalWidth * dev.height / img.naturalHeight));
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, width, dev.height);
      // TODO: Needed?
      img.style.display = 'none';
      var arr = new Uint8Array(dev.height * width);
      var data = ctx.getImageData(0, 0, width, dev.height).data;
      for (var i = 0; i < width; i++) {
        for (var j = 0; j < dev.height; j++) {
          var idx = ((dev.height - 1 - j) * width + i) * 4;
          arr[i * dev.height + j] = (
            (Math.floor(data[idx + 0] / 32) << 5) +
            (Math.floor(data[idx + 1] / 32) << 2) +
            (Math.floor(data[idx + 2] / 64) << 0));
        }
      }
      app.sendCommand(dev, brightness, 'P', width, frameTime);
      app.sendData(dev, arr);
    }
  };
}

app.initialize = function() {

  $('#picker').spectrum({
    color: "#FF0000",
    flat: true,
    showInput: false,
    showButtons: false,
    preferredFormat: "hex",
    move: sendColor
  });

  noUiSlider.create(speedSlider, {
    start: 45,
    range: { min: 0, max: 100},
  });
  speedSlider.noUiSlider.on('update', function() {
    sendColor();
  });
  noUiSlider.create(sizeSlider, {
    start: 45,
    range: { min: 0, max: 100},
  });
  sizeSlider.noUiSlider.on('update', function() {
    sendColor();
  });

  $('#rainbows').change(function() {
    sendColor();
  });
  $('#movement').change(function() {
    $('.ctl-movement').toggle(this.checked);
    sendColor();
  }).change();
  $('.ctl-movement').change(function() {
    sendColor();
  });

  if (!!window.cordova) {
    window.resolveLocalFileSystemURL(
      cordova.file.applicationDirectory + 'www/' + app.PAINT_DIR,
      function (fileSystem) {
        var reader = fileSystem.createReader();
        reader.readEntries(
          function (entries) {
            var images = [];
            for (var i in entries) {
              if (entries[i].isFile && !entries[i].isDirectory) {
                images.push(entries[i].name);
              }
            }
            initImages(images);
          },
          function (err) {
            console.log(err);
          }
        );
      }, function (err) {
        console.log(err);
      }
    );
  } else {
    // Not cordova? Rely on a static list, maybe up to date.
    initImages(['mario.png', 'fire.jpg', 'pacman.png', 'space_invaders.png']);
  }
  noUiSlider.create(imgWidthSlider, {
    start: 0,
    range: { min: 0, max: 255},
  });
  imgWidthSlider.noUiSlider.on('update', function() {
    sendImage();
  });

  app.initialized = true;
  app.startScan();
};

function initImages(files) {
  var none = $('#img_select_none');
  for (var i in files) {
    var file = files[i];
    var clone = none.clone().attr('id', 'img_select_' + file)
      .attr('imageid', file).removeClass('img-select-selected');
    clone.html('<img src="' + app.PAINT_DIR + file + '"/>');
    none.after(clone);
  }
  $('.img-select').click(function() {
    if ($(this).hasClass('img-select-selected')) {
      return;
    }
    $('.img-select').removeClass('img-select-selected');
    $(this).addClass('img-select-selected');
    var img = $(this).attr('imageid');
    if (img) {
      if (img === 'url') {
        $('#img_url').focus();
        var val = $('#img_url').val();
        if (val) {
          sendImage(val);
        }
      } else {
        sendImage(app.PAINT_DIR + img);
      }
    } else {
      sendColor();
    }
  });
  $('#img_url').change(function() {
    if ($(this).val()) {
      $('#img_select_url').removeClass('img-select-selected').click();
    }
  });
}

function listDevices() {
  $('#scanResultView').empty();
  if (app.devices.length === 0) {
    $('#loadingIndicator').show();
    $('#controlView').hide();
    return;
  } else {
    $('#loadingIndicator').hide();
  }
  var anyConnected = false;
  for (var i in app.devices) {
    var dev = app.devices[i];
    var htmlString = '<div class="deviceContainer';
    if (dev.isConnected()) {
      htmlString += ' connected';
      anyConnected = true;
    }
    htmlString += '" onclick="app.toggleConnect(\'' +
      dev.address + '\')">' +
      '<p class="deviceName">' + dev.name;
    if (dev.connectPending) {
      htmlString += ' Connecting...';
    }
    htmlString += '</p>' +
      '<p class="deviceAddress">' + dev.address + '</p>' +
      '</div>';
    $('#scanResultView').append($(htmlString));
  }
  $('#controlView').toggle(anyConnected);
};

app.startScan = function() {
  if (!window.cordova) {
    return;
  }
  console.log('Scanning started...');

  app.devices = {};

  var htmlString =
    '<img src="img/loader_small.gif" ' +
      'style="display:inline; vertical-align:middle">' +
    '<p style="display:inline">   Scanning...</p>';

  $('#scanResultView').append($(htmlString));

  $('#scanResultView').show();

  function onScanSuccess(dev) {
    if (dev.name &&
        (dev.name.indexOf('Blume') !== -1 ||
         dev.name.indexOf('Bluno') !== -1)) {
      app.devices[dev.address] = dev;

      console.log(
        'Found: ' + dev.name + ', ' +
        dev.address + ', ' + dev.rssi);

      listDevices();
    }
  }

  function onScanFailure(errorCode) {
    // Write debug information to console.
    console.log('Error ' + errorCode);
  }

  evothings.easyble.reportDeviceOnce(true);
  evothings.easyble.startScan(onScanSuccess, onScanFailure);

};

app.toggleConnect = function(address) {
  var dev = app.devices[address];
  if (dev && dev.isConnected()) {
    app.disconnectFrom(address);
  } else {
    app.connectTo(address);
  }
}

app.connectTo = function(address) {
  var dev = app.devices[address];

  function onConnectSuccess(dev) {
    function onServiceSuccess(dev) {

      console.log('Connected to ' + dev.name);

      dev.enableNotification(
        app.DFRBLU_SERVICE_UUID,
        app.DFRBLU_CHAR_RXTX_UUID,
        app.receivedData.bind(dev),
        function(errorCode) {
          console.log('BLE enableNotification error: ' + errorCode);
        },
        { writeConfigDescriptor: false });

      dev.connectPending = false;
      listDevices();

      app.sendAsk(dev, 'D');
    }

    function onServiceFailure(errorCode) {
      // Write debug information to console.
      console.log('Error reading services: ' + errorCode);
      dev.connectPending = false;
      listDevices();
    }

    // Connect to the appropriate BLE service
    dev.readServices([app.DFRBLU_SERVICE_UUID], onServiceSuccess, onServiceFailure);
  }

  function onConnectFailure(errorCode) {
    // Write debug information to console
    console.log('Error ' + errorCode);
    if (errorCode === 133) {
      // On Android this just means we should retry!
      console.log("Attempting reconnect to " + dev.name);
      app.connectTo(address);
    } else {
      dev.connectPending = false;
      listDevices();
    }
  }

  // Connect to our device
  console.log('Identifying service for communication');
  dev.connect(onConnectSuccess, onConnectFailure);
  dev.connectPending = true;
  listDevices();
};

app.disconnectFrom = function(address) {
  var dev = app.devices[address];
  dev.connectPending = false;
  dev.close();
  listDevices();
};

app.sendCommand = function(devices, brightness, mode) {
  var data = Array.prototype.slice.call(arguments, 3);
  // Commands always have brightness
  var cmd = [brightness];
  // Add mode if it was passed in
  if (mode) {
    // Convert one-character string to character code
    cmd.push(mode.charCodeAt(0));
  }
  // !, length of the rest, the rest!
  app.sendData(devices, [0x21, cmd.length + data.length].concat(cmd, data));
}

app.sendAsk = function(devices, question) {
  app.sendData(devices, [0x21, 0, question.charCodeAt(0)]);
}

function toHexString(byteArray) {
  var s = '0x';
  for (var i in byteArray) {
    s += ('0' + (byteArray[i] & 0xFF).toString(16)).slice(-2);
  };
  return s;
}

app.sendData = function(devices, data) {
  var tosend;
  if ((typeof data) == 'string') {
    tosend = new TextEncoder("ascii").encode(data);
  } else if (Array.isArray(data)) {
    tosend = new Uint8Array(data);
  } else {
    tosend = data;
  }
  if (tosend.length > 16) {
    //console.log("chunking data of length", tosend.length);
    for (var i = 0; i < tosend.length; i += 16) {
      app.sendData(devices, tosend.slice(i, i+16));
    }
    return;
  }
  //console.log("sending data of length", tosend.length);
  if (!devices) {
    devices = app.devices;
  } else if (!Array.isArray(devices)) {
    devices = [devices];
  }

  for (var i in devices) {
    var dev = devices[i];
    if (!dev.isConnected() || dev.fake) {
      continue;
    }
    pendingSends++;
    dev.writeCharacteristic(
      app.DFRBLU_CHAR_RXTX_UUID,
      tosend,
      function() {
        //console.log("SENT: " + toHexString(tosend));
        pendingSends--;
        if (!pendingSends && sendOneMore) {
          sendOneMore = false;
          sendColor();
        }
      },
      function(err) {
        pendingSends--;
        console.log("ERR:", err, pendingSends);
        if (!pendingSends && sendOneMore) {
          sendOneMore = false;
          sendColor();
        }
      }
    );
  }
};

function buf2hex(buffer) { // buffer is an ArrayBuffer
  return Array.prototype.map.call(new Uint8Array(buffer), function(x) { return ('00' + x.toString(16)).slice(-2); }).join('');
}

app.receivedData = function(data) {
  var data = new Uint8Array(data);
  console.log('RECV:' + toHexString(data));

  if (data[0] === 0x58) {
    console.log("EEP!");
    sendColor();
  } else if (data[0] === 0x21) {
    console.log("question?!", this);
    if (data[1] === 0x44) {
      // Got dimensions result. "this" is the sending device.
      this.width = data[2];
      this.height = data[3];
      this.numLeds = data[4];
      this.maxFrames = data[5];
    }
  }
};

// DEBUG MODE: Hackily runs the app in the browser, simulator, etc.
function debugMode() {
  $('#controlView').show();
  $('#canvas').show();
  app.initialize();
  // Create a fake connected device
  app.devices = {
    abcdefghi: {
      fake: true,
      isConnected: function() { return true; },
      width: 1,
      height: 18,
      numLeds: 18,
      maxFrames: 64,
      name: 'Fake Blume',
      address: 'abcdefghi'
    }
  };
  listDevices();
}

if (!window.cordova) {
  $(function() {
    debugMode();
  });
}
