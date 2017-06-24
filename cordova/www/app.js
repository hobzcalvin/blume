//
// Copyright 2014, Andreas Lundquist
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// DFRobot - Bluno - Hello World
// version: 0.1 - 2014-11-21
//

// Route all console logs to Evothings studio log
if (window.hyper && window.hyper.log) { console.log = hyper.log; };

document.addEventListener(
	'deviceready',
	function() { evothings.scriptsLoaded(app.initialize) },
	false);

var app = {};

app.DFRBLU_SERVICE_UUID = '0000dfb0-0000-1000-8000-00805f9b34fb';
app.DFRBLU_CHAR_RXTX_UUID = '0000dfb1-0000-1000-8000-00805f9b34fb';

var sendingSomething = false;
var sendOneMore = false;

function sendColor(color) {
  if (sendingSomething) {
    sendOneMore = true;
    return;
  }
  if (!color) {
    color = $("#picker").spectrum("get");
  }
  var hsv = color.toHsv();
  hsv.h = Math.round(hsv.h / 360.0 * 255.0);
  hsv.s = Math.round(hsv.s * 255.0);
  hsv.v = Math.round(hsv.v * 255.0);
  if ($('#movement').is(':checked')) {
    app.sendCommand(hsv.v, 'M', hsv.h, hsv.s,
      parseInt($('#movement_speed').val()),
      parseInt($('#movement_size').val()) + (
        $('#movement_vertical').is(':checked') ? 0 : 101));
  } else {
    app.sendCommand(hsv.v, $('#rainbows').is(':checked') ? 'R' : 'C',
                    hsv.h, hsv.s);
  }
};

app.initialize = function() {
	app.connected = false;

  $('#picker').spectrum({
    flat: true,
    showInput: false,
    showButtons: false,
    preferredFormat: "hex",
    move: sendColor
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

  app.startScan();
};

app.startScan = function() {
	app.disconnect();

	console.log('Scanning started...');

	app.devices = {};
  app.connectedDevices = {};

	var htmlString =
		'<img src="img/loader_small.gif" ' +
			'style="display:inline; vertical-align:middle">' +
		'<p style="display:inline">   Scanning...</p>';

	$('#scanResultView').append($(htmlString));

	$('#scanResultView').show();

	function onScanSuccess(device) {
		if (device.name != null) {
			app.devices[device.address] = device;

			console.log(
				'Found: ' + device.name + ', ' +
				device.address + ', ' + device.rssi);

			var htmlString =
				'<div class="deviceContainer" onclick="app.connectTo(\'' +
					device.address + '\')">' +
				'<p class="deviceName">' + device.name + '</p>' +
				'<p class="deviceAddress">' + device.address + '</p>' +
				'</div>';

			$('#scanResultView').append($(htmlString));

      // XXX ggg
      if (device.name == 'Bluno') {
        app.connectTo(device.address);
      }
		}
	}

	function onScanFailure(errorCode) {
		// Show an error message to the user
		app.disconnect('Failed to scan for devices.');

		// Write debug information to console.
		console.log('Error ' + errorCode);
	}

	evothings.easyble.reportDeviceOnce(true);
	evothings.easyble.startScan(onScanSuccess, onScanFailure);

	$('#startView').hide();
};

app.setLoadingLabel = function(message) {
	console.log(message);
	$('#loadingStatus').text(message);
}

app.connectTo = function(address) {
	device = app.devices[address];

	$('#loadingView').css('display', 'table');

	app.setLoadingLabel('Trying to connect to ' + device.name);

	function onConnectSuccess(device) {
		function onServiceSuccess(device) {
			// Application is now connected
			app.connected = true;
      app.connectedDevices[device.address] = device

			console.log('Connected to ' + device.name);

      app.sendAsk('D');

			$('#loadingView').hide();
			$('#scanResultView').hide();
			$('#controlView').show();

			device.enableNotification(
			  app.DFRBLU_SERVICE_UUID,
				app.DFRBLU_CHAR_RXTX_UUID,
				app.receivedData,
				function(errorCode) {
					console.log('BLE enableNotification error: ' + errorCode);
				},
				{ writeConfigDescriptor: false });
		}

		function onServiceFailure(errorCode) {
			// Disconnect and show an error message to the user.
			app.disconnect('Device is not from DFRobot');

			// Write debug information to console.
			console.log('Error reading services: ' + errorCode);
		}

		app.setLoadingLabel('Identifying services...');

		// Connect to the appropriate BLE service
		device.readServices([app.DFRBLU_SERVICE_UUID], onServiceSuccess, onServiceFailure);
	}

	function onConnectFailure(errorCode) {
		// Disconnect and show an error message to the user.
		app.disconnect('Failed to connect to device');

		// Write debug information to console
		console.log('Error ' + errorCode);
	}

	// Stop scanning
	//evothings.easyble.stopScan();

	// Connect to our device
	console.log('Identifying service for communication');
	device.connect(onConnectSuccess, onConnectFailure);
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
	if (app.connected) {
    var tosend;
    if ((typeof data) == 'string') {
      tosend = new TextEncoder("ascii").encode(data);
    } else if (Array.isArray(data)) {
		  tosend = new Uint8Array(data);
    } else {
      tosend = data;
    }

    sendingSomething = true;
    for (var i in app.connectedDevices) {
      var device = app.connectedDevices[i];
      device.writeCharacteristic(
        app.DFRBLU_CHAR_RXTX_UUID,
        tosend,
        function() {
          sendingSomething = false;
          console.log("SENT:" + toHexString(tosend));
          if (sendOneMore) {
            sendOneMore = false;
            sendColor();
          }
        },
        function(err) {
          sendingSomething = false;
          console.log("ERR:" + err);
        });
    }
	} else {
		// Disconnect and show an error message to the user.
		app.disconnect('Disconnected');

		// Write debug information to console
		console.log('Error - No device connected.');
	}
};

function buf2hex(buffer) { // buffer is an ArrayBuffer
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

app.receivedData = function(data) {
	if (app.connected) {
		var data = new Uint8Array(data);
    console.log('RECV:' + toHexString(data));

		if (data[0] === 0x58) {
      console.log("EEP!");
      sendColor();
	  } else if (data[0] === 0x21) {
      console.log("question?! " + data.join(','));
    }
	} else {
		// Disconnect and show an error message to the user.
		app.disconnect('Disconnected');

		// Write debug information to console
		console.log('Error - No device connected.');
	}
};

app.disconnect = function(errorMessage) {
	/*if (errorMessage) {
		navigator.notification.alert(errorMessage, function() {});
	}*/

	app.connected = false;
	app.device = null;

	// Stop any ongoing scan and close devices.
	evothings.easyble.stopScan();
	evothings.easyble.closeConnectedDevices();

	console.log('Disconnected: ' + errorMessage);

	$('#scanResultView').hide();
	$('#scanResultView').empty();
	$('#controlView').hide();
	$('#startView').show();
};
