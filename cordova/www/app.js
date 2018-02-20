// Route all console logs to Evothings studio log
if (window.hyper && window.hyper.log) { console.log = hyper.log; };

if (window.cordova) {
  // We're in the Cordova app; initialize when the device is ready.
  // Do CodePush sync when the device is ready and every time we're
  // foregrounded.
  document.addEventListener('deviceready', function() {
    window.codePush.sync();
    window.codePush.getCurrentPackage(function(currentPackage) {
      if (currentPackage) {
        $('#codePushVersion').html(currentPackage.label);
      }
    });
    evothings.scriptsLoaded(app.initialize);
  });
  document.addEventListener("resume", function() {
    window.codePush.sync();
  });
} else {
  // No Cordova. Wait until jQuery's available (actually, we just need to wait
  // until app.initialize() is defined below, but this gives us a reasonable
  // delay), then initialize.
  $(function() {
    app.initialize();
  });
}

// Define globally for easy console debugging
app = {};
app.devices = {};
app.DFRBLU_SERVICE_UUID = '0000dfb0-0000-1000-8000-00805f9b34fb';
app.DFRBLU_CHAR_RXTX_UUID = '0000dfb1-0000-1000-8000-00805f9b34fb';
app.PAINT_DIR = 'img/paint/'

// Number of devices that still need to be sent the current command.
var pendingSends = 0;
// If truthy, this will be executed and unset when pendingSends returns to 0.
var doPostSend = null;

var speedSlider = document.getElementById('movement_speed');
var sizeSlider = document.getElementById('movement_size');
var imgBrightSlider = document.getElementById('img_bright_slider');
var imgWidthSlider = document.getElementById('img_width_slider');
var blobsBrightSlider = document.getElementById('blobs_bright_slider');
var blobsSpeedSlider = document.getElementById('blobs_speed_slider');
var blobsRedSizeSlider = document.getElementById('blobs_red_size_slider');
var blobsGreenSizeSlider = document.getElementById('blobs_green_size_slider');
var blobsBlueSizeSlider = document.getElementById('blobs_blue_size_slider');

function sendColor() {
  if (!app.initialized) {
    return;
  }
  if (pendingSends) {
    doPostSend = function() {
      sendColor();
    };
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
    app.sendCommand(null, hsv.v,
      $('#movement_random').is(':checked') ? 'Z' : 'M',
      hsv.h, hsv.s,
      speed + (
        rainbows ? 101 : 0),
      size + (
        $('#movement_vertical').is(':checked') ? 0 : 101));
  } else {
    app.sendCommand(null, hsv.v, rainbows ? 'R' : 'C', hsv.h, hsv.s);
  }
};

function imageDataPixelToByte(imageData, x, y) {
  // Takes an ImageData object and x,y and returns
  // the pixel at that coordiante in RRRGGGBB format.
  var idx = (x + y * imageData.width) * 4;
  return (
    (Math.floor(imageData.data[idx + 0] / 32) << 5) +
    (Math.floor(imageData.data[idx + 1] / 32) << 2) +
    (Math.floor(imageData.data[idx + 2] / 64) << 0));
}

handleGif = function(file) {
  var brightness = parseInt(imgBrightSlider.noUiSlider.get());
  var frameTime = parseInt(imgWidthSlider.noUiSlider.get());
  var canvas = document.getElementById('canvas');
  gifler(file).get().then(function(animator) {
    window.animator = animator; // XXX TEMP
    animator.onDrawFrame = function(ctx, frame) {
      for (var i in app.devices) {
        var dev = app.devices[i];
        if (!dev.isConnected()) {
          // Don't do anything with disconnected devices.
          continue;
        }
        if (!dev.maxFrames) {
          console.log("Skipping device with maxFrames=0", dev);
          continue;
        }
        if (!dev.imgArr) {
          dev.imgArr = new Uint8Array(
            dev.height * dev.width * 3 * animator._frames.length);
        } else if (animator._loops > 0) {
          app.sendCommand(
              dev, brightness, 'P',
              animator._frames.length, frameTime,
              24);
          app.sendData(dev, dev.imgArr);
          dev.imgArr = null;
          continue;
        }

        // Draw the image on the canvas to scale it.
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(frame.buffer, 0, 0, dev.width, dev.height);
        // Grab scaled pixel data and put it in our data array.
        var data = ctx.getImageData(0, 0, dev.width, dev.height);
        for (var x = 0; x < dev.width; x++) {
          for (var y = 0; y < dev.height; y++) {
            // Loop through R, G, B
            for (var i = 0; i < 3; i++) {
              dev.imgArr[(x + dev.width * y +
                   animator._frameIndex * dev.width * dev.height) * 3 + i] =
                data.data[(x + y * dev.width) * 4 + i];
            }
          }
        }
      }
      if (animator._loops > 0) {
        animator.stop();
      }
    };
    //var canvas = gifler.Gif.getCanvasElement('#canvas');
    animator.animateInCanvas(canvas, false);
  }, function() {
    console.log("animation error??", arguments);
  });
}

sendImage = function(file) {
  if (!app.initialized) {
    return;
  }
  if (pendingSends) {
    // Don't send a new image, but do sent the latest brightness/width
    doPostSend = function() {
      sendImage();
    };
    return;
  }
  var brightness = parseInt(imgBrightSlider.noUiSlider.get());
  var frameTime = parseInt(imgWidthSlider.noUiSlider.get());
  if (!file) {
    // No file specified: just tell poi new brightness/frame-time
    app.sendCommand(null, brightness, 'P', 0, frameTime);
    return;
  }

  /*
   * EXPERIMENTAL: Animated GIF support.
   * Kinda works, but doesn't check for maxFrames,
   * only supports 24-bit color,
   * is very slow (needs a full loop of the gif before sending),
   * and some frames don't appear as expected.
  if (file.endsWith('.gif')) {
    handleGif(file);
    return;
  }
  */

  var img = new Image();
  img.src = file;
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  img.onload = function() {
    // TODO: Avoid recomputing all this stuff for 2 (poi) devices
    // of the same dimensions.
    for (var i in app.devices) {
      var dev = app.devices[i];
      if (!dev.isConnected()) {
        // Don't do anything with disconnected devices.
        continue;
      }
      if (!dev.maxFrames) {
        console.log("Skipping device with maxFrames=0", dev);
        continue;
      }

      // This is a persistence-of-vision display if its width is 1.
      // Otherwise it's two-dimensional.
      var pov = dev.width == 1;
      // Frames of image data we will send.
      var numFrames = pov ? 
        // POV display: scale the image proportinally if we can;
        // otherwise make it maxFrames wide.
        Math.min(
          Math.round(img.naturalWidth * dev.height / img.naturalHeight),
          dev.maxFrames) :
        // 2D display: only sending one frame.
        1;
      // Image will be scaled to numFrames for POV imagery
      // and scaled to the device's width for 2D imagery
      var width = pov ? numFrames : dev.width;
      // If maxFrames is at least 3x numFrames, we can send in 24-bit color
      // instead of 8-bit color.
      var trueColor = dev.maxFrames >= numFrames * 3;

      // Draw the image on the canvas to scale it.
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, width, dev.height);
      // TODO: Needed?
      img.style.display = 'none';
      // Multiply array size by 3 for 24-bit color.
      var arr = new Uint8Array(dev.height * width * (trueColor ? 3 : 1));
      // Grab scaled pixel data and put it in our data array.
      var data = ctx.getImageData(0, 0, width, dev.height);
      for (var x = 0; x < width; x++) {
        for (var y = 0; y < dev.height; y++) {
          var outputIdx = pov ?
            // POV images are sent by column,
            x * dev.height + y :
            // while 2D images are standardized to be sent as progressive
            // rows of data.
            x + width * y;
          if (trueColor) {
            // Loop through R, G, B
            for (var i = 0; i < 3; i++) {
              // Image data is in RGBA format
              arr[outputIdx * 3 + i] = data.data[(x + y * width) * 4 + i];
            }
          } else {
            arr[outputIdx] = imageDataPixelToByte(data, x, y);
          }
        }
      }
      app.sendCommand(
          dev, brightness, 'P',
          numFrames, frameTime,
          trueColor ? 24 : 8);
      app.sendData(dev, arr);
    }
  };
};

sendBlobs = function() {
  if (!app.initialized) {
    return;
  }
  if (pendingSends) {
    doPostSend = function() {
      sendBlobs();
    };
    return;
  }
  var bright = parseInt(blobsBrightSlider.noUiSlider.get());
  var speed = parseInt(blobsSpeedSlider.noUiSlider.get());
  var rs = parseInt(blobsRedSizeSlider.noUiSlider.get());
  var gs = parseInt(blobsGreenSizeSlider.noUiSlider.get());
  var bs = parseInt(blobsBlueSizeSlider.noUiSlider.get());
  app.sendCommand(null, bright, 'B', speed, rs, gs, bs);
};

sendText = function() {
  if (!app.initialized) {
    return;
  }
  if (pendingSends) {
    doPostSend = function() {
      sendText();
    };
    return;
  }
  var color = $("#textColorPicker").spectrum("get");
  var hsv = color.toHsv();
  hsv.h = Math.round(hsv.h / 360.0 * 255.0);
  hsv.s = Math.round(hsv.s * 255.0);
  hsv.v = Math.round(hsv.v * 255.0);
  app.sendCommand(null, hsv.v, 'T', hsv.h, hsv.s);
  var txt = new TextEncoder("ascii").encode($('#textInput').val() + '\0');
  app.sendData(null, txt);
}

app.initialize = function() {

  $('#accordion .collapse').on('show.bs.collapse', function() {
    if (this.id === 'collapseColor') {
      // Switch to color mode: send the latest
      sendColor();
    } else if (this.id === 'collapseImage') {
      // Switch to image mode: we won't send any image until the user selects
      // one, so revert the selection to None.
      $('#img_select_none').click();
    } else if (this.id === 'collapseBlobs') {
      sendBlobs();
    } else if (this.id === 'collapseText') {
      sendText();
    }
  });

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
  noUiSlider.create(imgBrightSlider, {
    start: 255,
    range: { min: 0, max: 255},
  });
  noUiSlider.create(imgWidthSlider, {
    start: 0,
    range: { min: 0, max: 255},
  });
  imgBrightSlider.noUiSlider.on('update', function() {
    sendImage();
  });
  imgWidthSlider.noUiSlider.on('update', function() {
    sendImage();
  });

  noUiSlider.create(blobsBrightSlider, {
    start: 255,
    range: { min: 0, max: 255 },
  });
  blobsBrightSlider.noUiSlider.on('update', function() {
    sendBlobs();
  });
  [blobsSpeedSlider, blobsRedSizeSlider, blobsGreenSizeSlider,
      blobsBlueSizeSlider].forEach(function(slider) {
    noUiSlider.create(slider, {
      start: 64,
      range: { min: 0, max: 255 },
    });
    slider.noUiSlider.on('update', function() {
      sendBlobs();
    });
  });

  $('#textColorPicker').spectrum({
    color: "#FF0000",
    flat: true,
    showInput: false,
    showButtons: false,
    preferredFormat: "hex",
    move: sendText
  });
  $('#textInput').on('input', sendText);

  app.initialized = true;
  app.startScan();
  listDevices();

  setTimeout(function() {
    if (Object.keys(app.devices).length === 0) {
      // We have no devices after a while. Offer the fake device.
      var fake = {
        fake: true,
        connected: false,
        isConnected: function() { return this.connected; },
        close: function() { this.connected = false; },
        width: 1,
        height: 18,
        numLeds: 18,
        maxFrames: 64,
        maxText: 32,
        name: 'Fake Blume',
        address: 'abcdefghi'
      };
      app.devices[fake.address] = fake;
      listDevices();
    }
  }, 3000);
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
    if (pendingSends) {
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
  if (Object.keys(app.devices).length === 0) {
    $('#loadingIndicator').show();
    $('#controlView').hide();
    return;
  } else {
    $('#loadingIndicator').hide();
    $('#scanResultView').show();
  }
  var anyConnected = false;
  var anyImage = false;
  var anyText = false;
  // Set the max text length to the lowest supported maxText of any device.
  var minText = 999;
  for (var i in app.devices) {
    var dev = app.devices[i];
    var htmlString = '<div class="deviceContainer';
    if (dev.isConnected()) {
      htmlString += ' connected';
      anyConnected = true;
    }
    if (dev.maxFrames) {
      anyImage = true;
    }
    if (dev.maxText) {
      anyText = true;
      minText = Math.min(minText, dev.maxText);
    }
    htmlString += '" onclick="app.toggleConnect(\'' +
      dev.address + '\')">' +
      '<p class="deviceName">' + dev.name;
    if (dev.connectPending) {
      htmlString += ' <i>Connecting...</i>';
    }
    htmlString += '</p>' +
      '<p class="deviceAddress">' + dev.address + '</p>' +
      '</div>';
    $('#scanResultView').append($(htmlString));
  }
  $('#controlView').toggle(anyConnected);
  $('#imageCard').toggle(anyImage);
  $('#textCard').toggle(anyText);
  $('#textInput').attr('maxlength', minText);
};

app.startScan = function() {
  if (!window.cordova) {
    return;
  }
  console.log('Scanning started...');

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
  if (dev.fake) {
    dev.connectPending = true;
    listDevices();
    setTimeout(function() {
      dev.connectPending = false;
      dev.connected = true;
      listDevices();
    }, 1000);
    return;
  }

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

function sendEnd() {
  pendingSends--;
  if (!pendingSends && doPostSend) {
    doPostSend();
    doPostSend = null;
  }
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
        sendEnd();
      },
      function(err) {
        console.log("ERR:", err, pendingSends);
        sendEnd();
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
  } else if (data[0] === 0x21) {
    console.log("question?!", this);
    if (data[1] === 0x44) {
      // Got dimensions result. "this" is the sending device.
      this.width = data[2];
      this.height = data[3];
      this.numLeds = data[4];
      this.maxFrames = data[5];
      this.maxText = data[6];
      listDevices();
    }
  }
};

