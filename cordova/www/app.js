// Route all console logs to Evothings studio log
if (window.hyper && window.hyper.log) { console.log = hyper.log; };

document.addEventListener('deviceready', function() {
  window.codePush.sync();
  evothings.scriptsLoaded(app.initialize);
});
document.addEventListener("resume", function() {
  window.codePush.sync();
});

var app = {};

app.DFRBLU_SERVICE_UUID = '0000dfb0-0000-1000-8000-00805f9b34fb';
app.DFRBLU_CHAR_RXTX_UUID = '0000dfb1-0000-1000-8000-00805f9b34fb';

var pendingSends = 0;
var sendOneMore = false;

var speedSlider = document.getElementById('movement_speed');
var sizeSlider = document.getElementById('movement_size');

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
  /*
  if (!hsv.h) {
    console.log("sending...");
    sendImage(255);//hsv.v);
    return;
  }
  */
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

sendImage = function(brightness) {
  var img = new Image();
  img.src = 'img/paint/mario.png';
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
      app.sendCommand(dev, brightness, 'P', width, 0);
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

  app.initialized = true;
  app.startScan();
};

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
    }

    // Connect to the appropriate BLE service
    dev.readServices([app.DFRBLU_SERVICE_UUID], onServiceSuccess, onServiceFailure);
  }

  function onConnectFailure(errorCode) {
    // Write debug information to console
    console.log('Error ' + errorCode);
    dev.connectPending = false;
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

app.sendCommand = function(devices, brightness, mode, ...data) {
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
  byteArray.forEach(function(byte) {
    s += ('0' + (byte & 0xFF).toString(16)).slice(-2);
  });
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
    if (!dev.isConnected()) {
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
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

app.receivedData = function(data) {
  var data = new Uint8Array(data);
  console.log('RECV:' + toHexString(data));

  if (data[0] === 0x58) {
    console.log("EEP!");
    sendColor();
  } else if (data[0] === 0x21) {
    console.log("question?! " + data.join(','), this);
    if (data[1] === 0x44) {
      // Got dimensions result. "this" is the sending device.
      this.width = data[2];
      this.height = data[3];
      this.numLeds = data[4];
      this.maxFrames = data[5];
    }
  }
};

// DEBUG MODE: Uncomment this stuff to run the app in the browser.
/*
$(function() {
  $('#controlView').show();
  $('#canvas').show();
  // This will throw errors without evothings libraries defined.
  app.initialize();
});
*/
