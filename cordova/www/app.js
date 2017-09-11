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
  if ($('#movement').is(':checked')) {
    app.sendCommand(hsv.v, 'M', hsv.h, hsv.s,
      speed + (
        rainbows ? 101 : 0),
      size + (
        $('#movement_vertical').is(':checked') ? 0 : 101));
  } else {
    app.sendCommand(hsv.v, rainbows ? 'R' : 'C', hsv.h, hsv.s);
  }
};

sendImage = function(brightness) {
  var img = new Image();
  img.src = 'img/paint/mario.png';
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  img.onload = function() {
    window.theimg = img;
    var width = Math.min(25, Math.round(img.naturalWidth * 50.0 / img.naturalHeight));
    ctx.drawImage(img, 0, 0, width, 50);
    // TODO: Needed?
    img.style.display = 'none';
    var arr = new Uint8Array(50 * width);
    var data = ctx.getImageData(0, 0, width, 50).data;
    for (var i = 0; i < width; i++) {
      for (var j = 0; j < 50; j++) {
        var idx = ((50 - 1 - j) * width + i) * 4;
        arr[i * 50 + j] = (
          (Math.floor(data[idx + 0] / 32) << 5) +
          (Math.floor(data[idx + 1] / 32) << 2) +
          (Math.floor(data[idx + 2] / 64) << 0));
      }
    }
    app.sendCommand(brightness, 'P', width, 0);
    app.sendData(arr);
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
    var device = app.devices[i];
    var htmlString = '<div class="deviceContainer';
    if (device.isConnected()) {
      htmlString += ' connected';
      anyConnected = true;
    }
    htmlString += '" onclick="app.toggleConnect(\'' +
      device.address + '\')">' +
      '<p class="deviceName">' + device.name;
    if (device.connectPending) {
      htmlString += ' Connecting...';
    }
    htmlString += '</p>' +
      '<p class="deviceAddress">' + device.address + '</p>' +
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

  function onScanSuccess(device) {
    if (device.name &&
        (device.name.indexOf('Blume') !== -1 ||
         device.name.indexOf('Bluno') !== -1)) {
      app.devices[device.address] = device;

      console.log(
        'Found: ' + device.name + ', ' +
        device.address + ', ' + device.rssi);

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
  var device = app.devices[address];
  if (device && device.isConnected()) {
    app.disconnectFrom(address);
  } else {
    app.connectTo(address);
  }
}

app.connectTo = function(address) {
  var device = app.devices[address];

  function onConnectSuccess(device) {
    function onServiceSuccess(device) {

      console.log('Connected to ' + device.name);

      device.enableNotification(
        app.DFRBLU_SERVICE_UUID,
        app.DFRBLU_CHAR_RXTX_UUID,
        app.receivedData.bind(device),
        function(errorCode) {
          console.log('BLE enableNotification error: ' + errorCode);
        },
        { writeConfigDescriptor: false });

      device.connectPending = false;
      listDevices();

      // TODO: Only need to send this once per connected device...
      app.sendAsk('D');
    }

    function onServiceFailure(errorCode) {
      // Write debug information to console.
      console.log('Error reading services: ' + errorCode);
      device.connectPending = false;
    }

    // Connect to the appropriate BLE service
    device.readServices([app.DFRBLU_SERVICE_UUID], onServiceSuccess, onServiceFailure);
  }

  function onConnectFailure(errorCode) {
    // Write debug information to console
    console.log('Error ' + errorCode);
    device.connectPending = false;
  }

  // Stop scanning
  //evothings.easyble.stopScan();

  // Connect to our device
  console.log('Identifying service for communication');
  device.connect(onConnectSuccess, onConnectFailure);
  device.connectPending = true;
  listDevices();
};

app.disconnectFrom = function(address) {
  var device = app.devices[address];
  device.connectPending = false;
  device.close();
  listDevices();
};

app.sendCommand = function(brightness, mode, ...data) {
  // Commands always have brightness
  var cmd = [brightness];
  // Add mode if it was passed in
  if (mode) {
    // Convert one-character string to character code
    cmd.push(mode.charCodeAt(0));
  }
  // !, length of the rest, the rest!
  app.sendData([0x21, cmd.length + data.length].concat(cmd, data));
}

app.sendAsk = function(question) {
  app.sendData([0x21, 0, question.charCodeAt(0)]);
}

function toHexString(byteArray) {
  var s = '0x';
  byteArray.forEach(function(byte) {
    s += ('0' + (byte & 0xFF).toString(16)).slice(-2);
  });
  return s;
}

app.sendData = function(data) {
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
      app.sendData(tosend.slice(i, i+16));
    }
    return;
  }
  //console.log("sending data of length", tosend.length);

  for (var i in app.devices) {
    var device = app.devices[i];
    if (!device.isConnected()) {
      continue;
    }
    pendingSends++;
    device.writeCharacteristic(
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
      });
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

