// File: easyble.js updated 160713

;(function()
{
	// Load script used by this file.
	evothings.loadScript('libs/evothings/util/util.js');

	/**
	 * @namespace
	 * @description <p>Library for making BLE programming easier.</p>
	 * <p>An all-in-one file with this library and helper libraries included is
	 * available in file <a href=""https://github.com/evothings/evothings-libraries/blob/master/libs/evothings/easyble/easyble.dist.js>easyble.dist.js</a>. Include this file in index.html (recommended).</p>
	 * <p>If you include <code>easyble.js</code> rather than <code>easyble.dist.js</code> it is safe practise to call function {@link evothings.scriptsLoaded}
	 * to ensure dependent libraries are loaded before calling functions
	 * in this library (in this case you also need to have the dependent library folders).</p>
	 */
	evothings.easyble = {};

	/**
	 * @namespace
	 * @description Error string.
	 */
	evothings.easyble.error = {};

	/**
	 * @description BLE device already connected.
	 */
	evothings.easyble.error.DEVICE_ALREADY_CONNECTED = 'EASYBLE_ERROR_DEVICE_ALREADY_CONNECTED';

	/**
	 * @description BLE device was disconnected.
	 */
	evothings.easyble.error.DISCONNECTED = 'EASYBLE_ERROR_DISCONNECTED';

	/**
	 * @description BLE service was not found.
	 */
	evothings.easyble.error.SERVICE_NOT_FOUND = 'EASYBLE_ERROR_SERVICE_NOT_FOUND';

	/**
	 * @description BLE characteristic was not found.
	 */
	evothings.easyble.error.CHARACTERISTIC_NOT_FOUND = 'EASYBLE_ERROR_CHARACTERISTIC_NOT_FOUND';

	/**
	 * @description BLE descriptor was not found.
	 */
	evothings.easyble.error.DESCRIPTOR_NOT_FOUND = 'EASYBLE_ERROR_DESCRIPTOR_NOT_FOUND';

	/**
	 * @private
	 * This variable is set "lazily", because when this script is loaded
	 * the Base64 Cordova module may not be loaded yet.
	 */
	var base64;

	/**
	 * Set to true to report found devices only once,
	 * set to false to report continuously.
	 * @private
	 */
	var reportDeviceOnce = false;

	/**
	 * @private
	 */
	var serviceFilter = false;

	/**
	 * @private
	 */
	var isScanning = false;

	/**
	 * Internal properties and functions.
	 * @private
	 */
	var internal = {};

	/**
	 * Internal variable used to track reading of service data.
	 * @private
	 */
	var readCounter = 0;

	/**
	 * Table of discovered devices.
	 * @private
	 */
	internal.knownDevices = {};

	/**
	 * Table of connected devices.
	 * @private
	 */
	internal.connectedDevices = {};

	/**
	 * @description <strong>Deprecated.</strong> Set whether to report devices once or continuously during scan.
	 * The default is to report continously.
	 * @deprecated Use the options parameter {@link evothings.easyble.ScanOptions} in
	 * function {@link evothings.easyble.startScan}.
	 * @param {boolean} reportOnce - Set to true to report found devices only once.
	 * Set to false to report continuously.
	 * @public
	 */
	evothings.easyble.reportDeviceOnce = function(reportOnce)
	{
		reportDeviceOnce = reportOnce;
	};

	/**
	 * @description Set to an Array of UUID strings to enable filtering of devices
	 * found by startScan().
	 * @param services - Array of UUID strings. Set to false to disable filtering.
	 * The default is no filtering. An empty array will cause no devices to be reported.
	 * @public
	 */
	evothings.easyble.filterDevicesByService = function(services)
	{
		serviceFilter = services;
	};

	/**
	 * @description Called during scanning when a BLE device is found.
	 * @callback evothings.easyble.scanCallback
	 * @param {evothings.easyble.EasyBLEDevice} device - EasyBLE device object
	 * found during scanning.
	 */

	/**
	 * @description This callback indicates that an operation was successful,
	 * without specifying and additional information.
	 * @callback evothings.easyble.emptyCallback - Callback that takes no parameters.
	 */

	/**
	 * @description This function is called when an operation fails.
	 * @callback evothings.easyble.failCallback
	 * @param {string} errorString - A human-readable string that
	 * describes the error that occurred.
	 */

	/**
	 * @description Called when successfully connected to a device.
	 * @callback evothings.easyble.connectCallback
	 * @param {evothings.easyble.EasyBLEDevice} device - EasyBLE devices object.
	 */

	/**
	 * @description Called when services are successfully read.
	 * @callback evothings.easyble.servicesCallback
	 * @param {evothings.easyble.EasyBLEDevice} device - EasyBLE devices object.
	 */

	/**
	 * @description Function when data is available.
	 * @callback evothings.easyble.dataCallback
	 * @param {ArrayBuffer} data - The data is an array buffer.
	 * Use an ArrayBufferView to access the data.
	 */

	/**
	 * @description Called with RSSI value.
	 * @callback evothings.easyble.rssiCallback
	 * @param {number} rssi - A negative integer, the signal strength in decibels.
	 * This value may be 127 which indicates an unknown value.
	 */

	/**
	 * @typedef {Object} evothings.easyble.ScanOptions
	 * @description Options for function {evothings.easyble.startScan}
	 * @property {array} serviceUUIDs - Array with strings of service UUIDs
	 * to scan for. When providing one service UUID, behaviour is the same on
	 * Android and iOS, when providing multiple UUIDs behaviour differs between
	 * platforms.
	 * On iOS multiple UUIDs are scanned for using logical OR operator,
	 * any UUID that matches any of the UUIDs adverticed by the device
	 * will count as a match. On Android, multiple UUIDs are scanned for
	 * using AND logic, the device must advertise all of the given UUIDs
	 * to produce a match. Leaving out this parameter or setting it to null
	 * will scan for all devices regardless of advertised services (default
	 * behaviour).
	 * @property {boolean} allowDuplicates - If true same device will be reported
	 * repeatedly during scanning, if false it will only be reported once.
	 * Default is true.
	 */

	/**
	 * Start scanning for devices. Note that the optional parameter serviceUUIDs
	 * has been deprecated. Please use the options parmameter
	 * {@link evothings.easyble.ScanOptions} instead to specify any specific
	 * service UUID to scan for.
	 * @param {evothings.easyble.scanCallback} success - Success function called when a
	 * device is found.
	 * Format: success({@link evothings.easyble.EasyBLEDevice}).
	 * @param {evothings.easyble.failCallback} fail - Error callback: fail(error).
	 * @param {evothings.easyble.ScanOptions} [options] - Object with scan options.
	 * @public
	 * @example
	 *   // Scan for all services.
	 *   evothings.easyble.startScan(
	 *       function(device)
	 *       {
	 *           console.log('Found device named: ' + device.name);
	 *       },
	 *       function(errorCode)
	 *       {
	 *           console.log('startScan error: ' + errorCode);
	 *       }
	 *   );
	 *
	 *   // Scan for specific service.
	 *   evothings.easyble.startScan(
	 *       function(device)
	 *       {
	 *           console.log('Found device named: ' + device.name);
	 *       },
	 *       function(errorCode)
	 *       {
	 *           console.log('startScan error: ' + errorCode);
	 *       },
	 *       // Eddystone service UUID specified in options.
	 *       { serviceUUIDs: ['0000FEAA-0000-1000-8000-00805F9B34FB'] }
	 *   );
	 */
	evothings.easyble.startScan = function(arg1, arg2, arg3, arg4)
	{
		// Stop ongoing scan.
		evothings.easyble.stopScan();

		// Clear list of found devices.
		internal.knownDevices = {};

		// Scanning parameters.
		var serviceUUIDs;
		var success;
		var fail;
		var options;
		var allowDuplicates = undefined;

		// Determine parameters.
		if (Array.isArray(arg1))
		{
			// First param is an array of serviceUUIDs.
			serviceUUIDs = arg1;
			success = arg2;
			fail = arg3;
			options = arg4;
		}
		else if ('function' == typeof arg1)
		{
			// First param is a function.
			serviceUUIDs = null;
			success = arg1;
			fail = arg2;
			options = arg3;
		}

		// Set options.
		if (options)
		{
			if (Array.isArray(options.serviceUUIDs))
			{
				serviceUUIDs = options.serviceUUIDs;
			}

			if (options.allowDuplicates === true)
			{
				allowDuplicates = true;
			}
			else if (options.allowDuplicates === false)
			{
				allowDuplicates = false;
			}
		}

		// Start scanning.
		isScanning = true;
		if (Array.isArray(serviceUUIDs))
		{
			evothings.ble.startScan(serviceUUIDs, onDeviceFound, onError);
		}
		else
		{
			evothings.ble.startScan(onDeviceFound, onError);
		}

		function onDeviceFound(device)
		{
			// Don't report devices unless the isScanning flag is true.
			// This is to prevent devices being reported after stopScanning
			// has been called (this can happen since scanning does not stop
			// instantly when evothings.ble.stopScan is called).
			if (!isScanning) return;

			// Ensure we have advertisementData.
			internal.ensureAdvertisementData(device);

			// Check if the device matches the filter, if we have a filter.
			if (!internal.deviceMatchesServiceFilter(device))
			{
				return;
			}

			// Check if we already have got the device.
			var existingDevice = internal.knownDevices[device.address]
			if (existingDevice)
			{
				// Do not report device again if flag is set.
				if (allowDuplicates === false || reportDeviceOnce === true) { return; }

				// Duplicates allowed, report device again.
				existingDevice.rssi = device.rssi;
				existingDevice.name = device.name;
				existingDevice.scanRecord = device.scanRecord;
				existingDevice.advertisementData = device.advertisementData;
				success(existingDevice);

				return;
			}

			// New device, add to known devices.
			internal.knownDevices[device.address] = device;

			// Set connect status.
			device.__isConnected = false;

			// Add methods to the device info object.
			internal.addMethodsToDeviceObject(device);

			// Call callback function with device info.
			success(device);
		}

		function onError(errorCode)
		{
			fail(errorCode);
		}
	};

	/**
	 * Stop scanning for devices.
	 * @example
	 *   evothings.easyble.stopScan();
	 */
	evothings.easyble.stopScan = function()
	{
		isScanning = false;
		evothings.ble.stopScan();
	};

	/**
	 * Disconnect and close all connected BLE devices.
	 * @example
	 *   evothings.easyble.closeConnectedDevices();
	 */
	evothings.easyble.closeConnectedDevices = function()
	{
		for (var key in internal.connectedDevices)
		{
			var device = internal.connectedDevices[key];
			device && device.close();
			internal.connectedDevices[key] = null;
		}
	};

	/**
	 * If device already has advertisementData, does nothing.
	 * If device instead has scanRecord, creates advertisementData.
	 * See ble.js for AdvertisementData reference.
	 * @param device - Device object.
	 * @private
	 */
	internal.ensureAdvertisementData = function(device)
	{
		if (!base64) { base64 = cordova.require('cordova/base64'); }

		// If device object already has advertisementData we
		// do not need to parse the scanRecord.
		if (device.advertisementData) { return; }

		// Must have scanRecord yo continue.
		if (!device.scanRecord) { return; }

		// Here we parse BLE/GAP Scan Response Data.
		// See the Bluetooth Specification, v4.0, Volume 3, Part C, Section 11,
		// for details.

		var byteArray = evothings.util.base64DecToArr(device.scanRecord);
		var pos = 0;
		var advertisementData = {};
		var serviceUUIDs;
		var serviceData;

		// The scan record is a list of structures.
		// Each structure has a length byte, a type byte, and (length-1) data bytes.
		// The format of the data bytes depends on the type.
		// Malformed scanRecords will likely cause an exception in this function.
		while (pos < byteArray.length)
		{
			var length = byteArray[pos++];
			if (length == 0)
			{
				break;
			}
			length -= 1;
			var type = byteArray[pos++];

			// Parse types we know and care about.
			// Skip other types.

			var BLUETOOTH_BASE_UUID = '-0000-1000-8000-00805f9b34fb'

			// Convert 16-byte Uint8Array to RFC-4122-formatted UUID.
			function arrayToUUID(array, offset)
			{
				var k=0;
				var string = '';
				var UUID_format = [4, 2, 2, 2, 6];
				for (var l=0; l<UUID_format.length; l++)
				{
					if (l != 0)
					{
						string += '-';
					}
					for (var j=0; j<UUID_format[l]; j++, k++)
					{
						string += evothings.util.toHexString(array[offset+k], 1);
					}
				}
				return string;
			}

			if (type == 0x02 || type == 0x03) // 16-bit Service Class UUIDs.
			{
				serviceUUIDs = serviceUUIDs ? serviceUUIDs : [];
				for(var i=0; i<length; i+=2)
				{
					serviceUUIDs.push(
						'0000' +
						evothings.util.toHexString(
							evothings.util.littleEndianToUint16(byteArray, pos + i),
							2) +
						BLUETOOTH_BASE_UUID);
				}
			}
			if (type == 0x04 || type == 0x05) // 32-bit Service Class UUIDs.
			{
				serviceUUIDs = serviceUUIDs ? serviceUUIDs : [];
				for (var i=0; i<length; i+=4)
				{
					serviceUUIDs.push(
						evothings.util.toHexString(
							evothings.util.littleEndianToUint32(byteArray, pos + i),
							4) +
						BLUETOOTH_BASE_UUID);
				}
			}
			if (type == 0x06 || type == 0x07) // 128-bit Service Class UUIDs.
			{
				serviceUUIDs = serviceUUIDs ? serviceUUIDs : [];
				for (var i=0; i<length; i+=16)
				{
					serviceUUIDs.push(arrayToUUID(byteArray, pos + i));
				}
			}
			if (type == 0x08 || type == 0x09) // Local Name.
			{
				advertisementData.kCBAdvDataLocalName = evothings.ble.fromUtf8(
					new Uint8Array(byteArray.buffer, pos, length));
			}
			if (type == 0x0a) // TX Power Level.
			{
				advertisementData.kCBAdvDataTxPowerLevel =
					evothings.util.littleEndianToInt8(byteArray, pos);
			}
			if (type == 0x16) // Service Data, 16-bit UUID.
			{
				serviceData = serviceData ? serviceData : {};
				var uuid =
					'0000' +
					evothings.util.toHexString(
						evothings.util.littleEndianToUint16(byteArray, pos),
						2) +
					BLUETOOTH_BASE_UUID;
				var data = new Uint8Array(byteArray.buffer, pos+2, length-2);
				serviceData[uuid] = base64.fromArrayBuffer(data);
			}
			if (type == 0x20) // Service Data, 32-bit UUID.
			{
				serviceData = serviceData ? serviceData : {};
				var uuid =
					evothings.util.toHexString(
						evothings.util.littleEndianToUint32(byteArray, pos),
						4) +
					BLUETOOTH_BASE_UUID;
				var data = new Uint8Array(byteArray.buffer, pos+4, length-4);
				serviceData[uuid] = base64.fromArrayBuffer(data);
			}
			if (type == 0x21) // Service Data, 128-bit UUID.
			{
				serviceData = serviceData ? serviceData : {};
				var uuid = arrayToUUID(byteArray, pos);
				var data = new Uint8Array(byteArray.buffer, pos+16, length-16);
				serviceData[uuid] = base64.fromArrayBuffer(data);
			}
			if (type == 0xff) // Manufacturer-specific Data.
			{
				// Annoying to have to transform base64 back and forth,
				// but it has to be done in order to maintain the API.
				advertisementData.kCBAdvDataManufacturerData =
					base64.fromArrayBuffer(new Uint8Array(byteArray.buffer, pos, length));
			}

			pos += length;
		}
		advertisementData.kCBAdvDataServiceUUIDs = serviceUUIDs;
		advertisementData.kCBAdvDataServiceData = serviceData;
		device.advertisementData = advertisementData;

		/*
		// Log raw data for debugging purposes.

		console.log("scanRecord: "+evothings.util.typedArrayToHexString(byteArray));

		console.log(JSON.stringify(advertisementData));
		*/
	}

	/**
	 * Returns true if the device matches the serviceFilter, or if there is no filter.
	 * Returns false otherwise.
	 * @private
	 */
	internal.deviceMatchesServiceFilter = function(device)
	{
		if (!serviceFilter) { return true; }

		var advertisementData = device.advertisementData;
		if (advertisementData)
		{
			var serviceUUIDs = advertisementData.kCBAdvDataServiceUUIDs;
			if (serviceUUIDs)
			{
				for (var i in serviceUUIDs)
				{
					for (var j in serviceFilter)
					{
						if (serviceUUIDs[i].toLowerCase() ==
							serviceFilter[j].toLowerCase())
						{
							return true;
						}
					}
				}
			}
		}
		return false;
	}

	/**
	 * Add functions to the device object to allow calling them
	 * in an object-oriented style.
	 * @private
	 */
	internal.addMethodsToDeviceObject = function(deviceObject)
	{
		/**
		 * @namespace
		 * @alias evothings.easyble.EasyBLEDevice
		 * @description This is the BLE DeviceInfo object obtained from the
		 * underlying Cordova plugin.
		 * @property {string} address - Uniquely identifies the device.
		 * The form of the address depends on the host platform.
		 * @property {number} rssi - A negative integer, the signal strength in decibels.
		 * @property {string} name - The device's name, or nil.
		 * @property {string} scanRecord - Base64-encoded binary data. Its meaning is
		 * device-specific. Not available on iOS.
		 * @property {evothings.easyble.AdvertisementData} advertisementData -
		 * Object containing some of the data from the scanRecord.
		 */
		var device = deviceObject;

		/**
		 * @typedef {Object} evothings.easyble.AdvertisementData
		 * @description Information extracted from a scanRecord. Some or all of the fields may be
		 * undefined. This varies between BLE devices.
		 * Depending on OS version and BLE device, additional fields, not documented
		 * here, may be present.
		 * @property {string} kCBAdvDataLocalName - The device's name. Use this field
		 * rather than device.name, since on iOS the device name is cached and changes
		 * are not reflected in device.name.
		 * @property {number} kCBAdvDataTxPowerLevel - Transmission power level as
		 * advertised by the device.
		 * @property {boolean} kCBAdvDataIsConnectable - True if the device accepts
		 * connections. False if it doesn't.
		 * @property {array} kCBAdvDataServiceUUIDs - Array of strings, the UUIDs of
		 * services advertised by the device. Formatted according to RFC 4122,
		 * all lowercase.
		 * @property {object} kCBAdvDataServiceData - Dictionary of strings to strings.
		 * The keys are service UUIDs. The values are base-64-encoded binary data.
		 * @property {string} kCBAdvDataManufacturerData - Base-64-encoded binary data.
		 * This field is used by BLE devices to advertise custom data that don't fit
		 * into any of the other fields.
		 */

		/**
		 * Get device name. If there is a device name present in
		 * advertisement data, this is returned. Otherwise the value of
		 * the device.name field is returned. Note that iOS caches the
		 * device.name field, but not the name in advertisement data.
		 * If you change name of the device, it is more reliable to use
		 * the field in advertisement data (this name is set in the device
		 * firmware code).
		 * @return Name of the device.
		 * @public
		 * @instance
		 * @example
		 *   var name = device.getName();
		 */
		device.getName = function()
		{
			// If there is a device name present in advertisement data,
			// check if this matches. (This name is not cached by iOS.)
			var deviceName = device.advertisementData ?
				device.advertisementData.kCBAdvDataLocalName : false;
			if (deviceName)
			{
				return deviceName;
			}
			else
			{
				return device.name;
			}
		};

		/**
		 * Match device name. First checks the device name present in
		 * advertisement data, if not present checks device.name field.
		 * @param name The name to match.
		 * @return true if device has the given name, false if not.
		 * @public
		 * @instance
		 * @example
		 *   device.hasName('MyBLEDevice');
		 */
		device.hasName = function(name)
		{
			// If there is a device name present in advertisement data,
			// check if this matches. (This name is not cached by iOS.)
			var deviceName = device.advertisementData ?
				device.advertisementData.kCBAdvDataLocalName : false;
			if (deviceName)
			{
				// TODO: This should be a comparison, but there has been
				// instances of the kCBAdvDataLocalName field ending with
				// a non-printable character, using indexOf is a quick
				// fix for this.
				return 0 == deviceName.indexOf(name);
			}

			// Otherwise check if device.name matches (cached by iOS,
			// might not match if device name is updated).
			return name == device.name;
		};

		/**
		 * Connect to the device.
		 * @param {evothings.easyble.connectCallback} success -
		 * Called when connected: success(device).
		 * @param {evothings.easyble.failCallback} fail -
		 * Called on error and if a disconnect happens.
		 * Format: error(errorMessage)
		 * @public
		 * @instance
		 * @example
		 *   device.connect(
		 *     function(device)
		 *     {
		 *       console.log('device connected.');
		 *       // Read services here.
		 *     },
		 *     function(errorCode)
		 *     {
		 *       console.log('connect error: ' + errorCode);
		 *     });
		 */
		device.connect = function(success, fail)
		{
			internal.connectToDevice(device, success, fail);
		};

		/**
		 * Check if device is connected.
		 * @return true if connected, false if not connected.
		 * @public
		 * @instance
		 * @example
		 *   var connected = device.isConnected();
		 */
		device.isConnected = function()
		{
			return device.__isConnected;
		};

		/**
		 * Close the device. This disconnects from the BLE device.
		 * @public
		 * @instance
		 * @example
		 * device.close();
		 */
		device.close = function()
		{
			if (device.deviceHandle)
			{
				device.__isConnected = false;
				evothings.ble.close(device.deviceHandle);
			}
		};

		/**
		 * Read devices RSSI. Device must be connected.
		 * @param {evothings.easyble.rssiCallback} success - Callback called with
		 * RSSI value: success(rssi).
		 * @param {evothings.easyble.failCallback} fail - Called on error: fail(error).
		 * @public
		 * @instance
		 */
		device.readRSSI = function(success, fail)
		{
			evothings.ble.rssi(device.deviceHandle, success, fail);
		};

		/**
		 * @typedef {Object} evothings.easyble.ReadServicesOptions
		 * @description Options object for function
		 * {@link evothings.easyble.EasyBLEDevice#readServices}
		 * @property {array} serviceUUIDs - Array of service UUID strings.
		 */

		/**
		 * Read services, characteristics and descriptors for the
		 * specified service UUIDs.
		 * <strong>Services must be read be able to access characteristics and
		 * descriptors</strong>. Call this function before reading and writing
		 * characteristics/descriptors. (This function took an array of service
		 * UUIDs as first parameter in previous versions of this library, that
		 * is still supported for backwards compatibility but has ben deprecated.)
		 * @param {evothings.easyble.servicesCallback} success -
		 * Called when services are read: success(device)
		 * @param {evothings.easyble.failCallback} fail - error callback:
		 * error(errorMessage)
		 * @param {evothings.easyble.ReadServicesOptions} [options] - Optional
		 * object with setting that allow specification of which services to
		 * read. If left out, all services and related characteristics and
		 * descriptors are read (this can be time-consuming compared to
		 * reading selected services).
		 * @public
		 * @instance
		 * @example
		 *   // Read all services
		 *   device.readServices(
		 *     function(device)
		 *     {
		 *       console.log('Services available.');
		 *       // Read/write/enable notifications here.
		 *     },
		 *     function(errorCode)
		 *     {
		 *       console.log('readServices error: ' + errorCode);
		 *     });
		 *
		 *   // Read specific service
		 *   device.readServices(
		 *     function(device)
		 *     {
		 *       console.log('Services available.');
		 *       // Read/write/enable notifications here.
		 *     },
		 *     function(errorCode)
		 *     {
		 *       console.log('readServices error: ' + errorCode);
		 *     },
		 *     { serviceUUIDs: ['19b10000-e8f2-537e-4f6c-d104768a1214'] });
		 */
		device.readServices = function(arg1, arg2, arg3, arg4)
		{
			// Parameters.
			var serviceUUIDs;
			var success;
			var fail;
			var options;

			// For backwards compatibility when first arg specified
			// an array of service UUIDs.
			if (Array.isArray(arg1))
			{
				serviceUUIDs = arg1;
				success = arg2;
				fail = arg3;
				options = arg4;
			}
			// Previously you could set first param to null to read all services.
			// Here we handle this case for backwards compatibility.
			else if (arg1 === undefined || arg1 === null)
			{
				serviceUUIDs = null;
				success = arg2;
				fail = arg3;
				options = arg4;
			}
			else
			{
				success = arg1;
				fail = arg2;
				options = arg3;
			}

			if (options && Array.isArray(options.serviceUUIDs))
			{
				serviceUUIDs = options.serviceUUIDs;
			}

			internal.readServices(device, serviceUUIDs, success, fail);
		};

		/**
		 * Read value of characteristic.
		 * @param {string} serviceUUID - UUID of service that has the given
		 * characteristic (previous versions of this library allowed leaving out
		 * the service UUID, this is unsafe practice and has been deprecated, always
		 * specify the service UUID).
		 * @param {string} characteristicUUID - UUID of characteristic to read.
		 * @param {evothings.easyble.dataCallback} success - Success callback:
		 * success(data).
		 * @param {evothings.easyble.failCallback} fail - Error callback: fail(error).
		 * @public
		 * @instance
		 * @example
		 *   device.readCharacteristic(
		 *     serviceUUID,
		 *     characteristicUUID,
		 *     function(data)
		 *     {
		 *       console.log('characteristic data: ' + evothings.ble.fromUtf8(data));
		 *     },
		 *     function(errorCode)
		 *     {
		 *       console.log('readCharacteristic error: ' + errorCode);
		 *     });
		 */
		device.readCharacteristic = function(arg1, arg2, arg3, arg4)
		{
			if ('function' == typeof arg2)
			{
				// Service UUID is missing.
				internal.readCharacteristic(device, arg1, arg2, arg3);
			}
			else
			{
				// Service UUID is present.
				internal.readServiceCharacteristic(device, arg1, arg2, arg3, arg4);
			}
		};

		/**
		 * <strong>Deprecated</strong>.
		 * Use function {@link evothings.easyble.EasyBLEDevice#readCharacteristic}
		 * @deprecated
		 * @instance
		 */
		device.readServiceCharacteristic = function(
			serviceUUID, characteristicUUID, success, fail)
		{
			internal.readServiceCharacteristic(
				device, serviceUUID, characteristicUUID, success, fail);
		};

		/**
		 * Read value of descriptor.
		 * @param {string} serviceUUID - UUID of service that has the given
		 * characteristic (previous versions of this library allowed leaving out
		 * the service UUID, this is unsafe practice and has been deprecated, always
		 * specify the service UUID).
		 * @param {string} characteristicUUID - UUID of characteristic for descriptor.
		 * @param {string} descriptorUUID - UUID of descriptor to read.
		 * @param {evothings.easyble.dataCallback} success - Success callback:
		 * success(data).
		 * @param {evothings.easyble.failCallback} fail - Error callback: fail(error).
		 * @public
		 * @instance
		 * @example
		 *   device.readDescriptor(
		 *     serviceUUID,
		 *     characteristicUUID,
		 *     descriptorUUID,
		 *     function(data)
		 *     {
		 *       console.log('descriptor data: ' + evothings.ble.fromUtf8(data));
		 *     },
		 *     function(errorCode)
		 *     {
		 *       console.log('readDescriptor error: ' + errorCode);
		 *     });
		 */
		device.readDescriptor = function(arg1, arg2, arg3, arg4, arg5)
		{
			if ('function' == typeof arg3)
			{
				// Service UUID is missing.
				internal.readDescriptor(device, arg1, arg2, arg3, arg4);
			}
			else
			{
				// Service UUID is present.
				internal.readServiceDescriptor(device, arg1, arg2, arg3, arg4, arg5);
			}
		};

		/**
		 * <strong>Deprecated</strong>.
		 * Use function {@link evothings.easyble.EasyBLEDevice#readDescriptor}
		 * @deprecated
		 * @instance
		 */
		device.readServiceDescriptor = function(
			serviceUUID, characteristicUUID, descriptorUUID, success, fail)
		{
			internal.readServiceDescriptor(
				device, serviceUUID, characteristicUUID, descriptorUUID, success, fail);
		};

		/**
		 * Write value of characteristic.
		 * @param {string} serviceUUID - UUID of service that has the given
		 * characteristic (previous versions of this library allowed leaving out
		 * the service UUID, this is unsafe practice and has been deprecated, always
		 * specify the service UUID).
		 * @param {string} characteristicUUID - UUID of characteristic to write to.
		 * @param {ArrayBufferView} value - Value to write.
		 * @param {evothings.easyble.emptyCallback} success - Success callback: success().
		 * @param {evothings.easyble.failCallback} fail - Error callback: fail(error).
		 * @public
		 * @instance
		 * @example
		 *   device.writeCharacteristic(
		 *     serviceUUID,
		 *     characteristicUUID,
		 *     new Uint8Array([1]), // Write byte with value 1.
		 *     function()
		 *     {
		 *       console.log('characteristic written.');
		 *     },
		 *     function(errorCode)
		 *     {
		 *       console.log('writeCharacteristic error: ' + errorCode);
		 *     });
		 */
		device.writeCharacteristic = function(arg1, arg2, arg3, arg4, arg5)
		{
			if ('function' == typeof arg3)
			{
				// Service UUID is missing.
				internal.writeCharacteristic(device, arg1, arg2, arg3, arg4);
			}
			else
			{
				// Service UUID is present.
				internal.writeServiceCharacteristic(device, arg1, arg2, arg3, arg4, arg5);
			}
		};

		/**
		 * <strong>Deprecated</strong>.
		 * Use function {@link evothings.easyble.EasyBLEDevice#writeCharacteristic}
		 * @deprecated
		 * @instance
		 */
		device.writeServiceCharacteristic = function(
			serviceUUID, characteristicUUID, value, success, fail)
		{
			internal.writeServiceCharacteristic(
				device, serviceUUID, characteristicUUID, value, success, fail);
		};

		/**
		 * Write value of a characteristic for a specific service without response.
		 * This faster but not as fail safe as writing with response.
		 * Asks the remote device to NOT send a confirmation message.
		 * Experimental, implemented on Android.
		 * @param {string} serviceUUID - UUID of service that has the characteristic.
		 * @param {string} characteristicUUID - UUID of characteristic to write to.
		 * @param {ArrayBufferView} value - Value to write.
		 * @param {evothings.easyble.emptyCallback} success - Success callback: success().
		 * @param {evothings.easyble.failCallback} fail - Error callback: fail(error).
		 * @public
		 * @instance
		 * @example
		 *   device.writeCharacteristicWithoutResponse(
		 *     serviceUUID,
		 *     characteristicUUID,
		 *     new Uint8Array([1]), // Write byte with value 1.
		 *     function()
		 *     {
		 *       console.log('data sent.');
		 *     },
		 *     function(errorCode)
		 *     {
		 *       console.log('writeCharacteristicWithoutResponse error: ' + errorCode);
		 *     });
		 */
		device.writeCharacteristicWithoutResponse = function(
			serviceUUID, characteristicUUID, value, success, fail)
		{
			internal.writeServiceCharacteristicWithoutResponse(
				device, serviceUUID, characteristicUUID, value, success, fail);
		};

		/**
		 * <strong>Deprecated</strong>.
		 * Use function {@link evothings.easyble.EasyBLEDevice#writeCharacteristicWithoutResponse}
		 * @deprecated
		 * @instance
		 */
		device.writeServiceCharacteristicWithoutResponse = function(
			serviceUUID, characteristicUUID, value, success, fail)
		{
			internal.writeServiceCharacteristicWithoutResponse(
				device, serviceUUID, characteristicUUID, value, success, fail);
		};

		/**
		 * Write value of descriptor.
		 * @param {string} serviceUUID - UUID of service that has the given
		 * characteristic (previous versions of this library allowed leaving out
		 * the service UUID, this is unsafe practice and has been deprecated, always
		 * specify the service UUID).
		 * @param {string} characteristicUUID - UUID of characteristic for descriptor.
		 * @param {string} descriptorUUID - UUID of descriptor to write to.
		 * @param {ArrayBufferView} value - Value to write.
		 * @param {evothings.easyble.emptyCallback} success - Success callback: success().
		 * @param {evothings.easyble.failCallback} fail - Error callback: fail(error).
		 * @public
		 * @instance
		 * @example
		 *   device.writeDescriptor(
		 *     serviceUUID,
		 *     characteristicUUID,
		 *     descriptorUUID,
		 *     new Uint8Array([1]), // Write byte with value 1.
		 *     function()
		 *     {
		 *       console.log('descriptor written.');
		 *     },
		 *     function(errorCode)
		 *     {
		 *       console.log('writeDescriptor error: ' + errorCode);
		 *     });
		 */
		device.writeDescriptor = function(arg1, arg2, arg3, arg4, arg5, arg6)
		{
			if ('function' == typeof arg4)
			{
				// Service UUID is missing.
				internal.writeDescriptor(device, arg1, arg2, arg3, arg4, arg5);
			}
			else
			{
				// Service UUID is present.
				internal.writeServiceDescriptor(device, arg1, arg2, arg3, arg4, arg5, arg6);
			}
		};

		/**
		 * <strong>Deprecated</strong>.
		 * Use function {@link evothings.easyble.EasyBLEDevice#writeDescriptor}
		 * @deprecated
		 * @instance
		 */
		device.writeServiceDescriptor = function(
			serviceUUID, characteristicUUID, descriptorUUID, value, success, fail)
		{
			internal.writeServiceDescriptor(
				device,
				serviceUUID,
				characteristicUUID,
				descriptorUUID,
				value,
				success,
				fail);
		};

		/**
		 * @typedef {Object} evothings.easyble.NotificationOptions
		 * @description Options object for functions
		 * {@link evothings.easyble.EasyBLEDevice#enableNotification}
		 * and {@link evothings.easyble.EasyBLEDevice#disableNotification}.
		 * @property {boolean} writeConfigDescriptor - Supported on Android, ignored on iOS.
		 * Set to false to disable automatic writing of notification or indication
		 * config descriptor value. This is useful in special cases when full control
		 * of writing the config descriptor is needed.
		 */

		/**
		 * Subscribe to value updates of a characteristic.
		 * The success function will be called repeatedly whenever there
		 * is new data available.
		 * <p>On Android you can disable automatic write of notify/indicate and write
		 * the configuration descriptor yourself, supply an options object as
		 * last parameter, see example below.</p>
		 * @param {string} serviceUUID - UUID of service that has the given
		 * characteristic (previous versions of this library allowed leaving out
		 * the service UUID, this is unsafe practice and has been deprecated, always
		 * specify the service UUID).
		 * @param {string} characteristicUUID - UUID of characteristic to subscribe to.
		 * @param {evothings.easyble.dataCallback} success - Success callback:
		 * success(data).
		 * @param {evothings.easyble.failCallback} fail - Error callback: fail(error).
		 * @param {evothings.easyble.NotificationOptions} [options] -  Optional settings.
		 * @public
		 * @instance
		 * @example
		 * // Example call:
		 * device.enableNotification(
		 *   serviceUUID,
		 *   characteristicUUID,
		 *   function(data)
		 *   {
		 *     console.log('characteristic data: ' + evothings.ble.fromUtf8(data));
		 *   },
		 *   function(errorCode)
		 *   {
		 *     console.log('enableNotification error: ' + errorCode);
		 *   });
		 *
		 * // Turn off automatic writing of the config descriptor (for special cases):
		 * device.enableNotification(
		 *   serviceUUID,
		 *   characteristicUUID,
		 *   function(data)
		 *   {
		 *     console.log('characteristic data: ' + evothings.ble.fromUtf8(data));
		 *   },
		 *   function(errorCode)
		 *   {
		 *     console.log('enableNotification error: ' + errorCode);
		 *   },
		 *   { writeConfigDescriptor: false });
		 */
		device.enableNotification = function(arg1, arg2, arg3, arg4, arg5)
		{
			if ('function' == typeof arg2)
			{
				// Service UUID is missing.
				internal.enableNotification(device, arg1, arg2, arg3, arg4);
			}
			else
			{
				// Service UUID is present.
				internal.enableServiceNotification(device, arg1, arg2, arg3, arg4, arg5);
			}
		};

		/**
		 * <strong>Deprecated</strong>.
		 * Use function {@link evothings.easyble.EasyBLEDevice#enableNotification}
		 * @deprecated
		 * @instance
		 */
		device.enableServiceNotification = function(
			serviceUUID, characteristicUUID, success, fail, options)
		{
			internal.enableServiceNotification(
				device,
				serviceUUID,
				characteristicUUID,
				success,
				fail,
				options);
		};

		/**
		 * Unsubscribe from characteristic updates to stop notifications.
		 * <p>On Android you can disable automatic write of notify/indicate and write
		 * the configuration descriptor yourself, supply an options object as
		 * last parameter, see example below.</p>
		 * @param {string} serviceUUID - UUID of service that has the given
		 * characteristic (previous versions of this library allowed leaving out
		 * the service UUID, this is unsafe practice and has been deprecated, always
		 * specify the service UUID).
		 * @param serviceUUID - UUID of service that has the given characteristic.
		 * @param characteristicUUID - UUID of characteristic to unsubscribe from.
		 * @param {evothings.easyble.emptyCallback} success - Success callback: success()
		 * @param {evothings.easyble.failCallback} fail - Error callback: fail(error)
		 * @param {evothings.easyble.NotificationOptions} [options] -  Optional settings.
		 * @public
		 * @instance
		 * @example
		 * // Example call:
		 * device.disableNotification(
		 *   serviceUUID,
		 *   characteristicUUID,
		 *   function()
		 *   {
		 *     console.log('characteristic notification disabled');
		 *   },
		 *   function(errorCode)
		 *   {
		 *     console.log('disableNotification error: ' + errorCode);
		 *   });
		 */
		device.disableNotification = function(arg1, arg2, arg3, arg4, arg5)
		{
			if ('function' == typeof arg2)
			{
				// Service UUID is missing.
				internal.disableNotification(device, arg1, arg2, arg3, arg4);
			}
			else
			{
				// Service UUID is present.
				internal.disableServiceNotification(device, arg1, arg2, arg3, arg4, arg5);
			}
		};

		/**
		 * <strong>Deprecated</strong>.
		 * Use function {@link evothings.easyble.EasyBLEDevice#disableNotification}
		 * @deprecated
		 * @instance
		 */
		device.disableServiceNotification = function(
			serviceUUID, characteristicUUID, success, fail, options)
		{
			internal.disableServiceNotification(
				device, serviceUUID, characteristicUUID, success, fail, options);
		};
	};

	/**
	 * Connect to a device.
 	 * Called from evothings.easyble.EasyBLEDevice.
	 * @private
	 */
	internal.connectToDevice = function(device, success, fail)
	{
		// Check that device is not already connected.
		if (device.__isConnected)
		{
			fail(evothings.easyble.error.DEVICE_ALREADY_CONNECTED);
			return;
		}

		evothings.ble.connect(
			device.address,
			// Success callback.
			function(connectInfo)
			{
				// DEBUG LOG
				console.log('BLE connect state: ' + connectInfo.state);

				if (connectInfo.state == 2) // connected
				{
					device.deviceHandle = connectInfo.deviceHandle;
					device.__uuidMap = {};
					device.__serviceMap = {};
					device.__isConnected = true;
					internal.connectedDevices[device.address] = device;

					success(device);
				}
				else if (connectInfo.state == 0) // disconnected
				{
					device.__isConnected = false;
					internal.connectedDevices[device.address] = null;

					// TODO: Perhaps this should be redesigned, as disconnect is
					// more of a status change than an error? What do you think?
					fail && fail(evothings.easyble.error.DISCONNECTED);
				}
			},
			// Error callback.
			function(errorCode)
			{
				// DEBUG LOG
				console.log('BLE connect error: ' + errorCode);

				// Set isConnected to false on error.
				device.__isConnected = false;
				internal.connectedDevices[device.address] = null;
				fail(errorCode);
			});
	};

	/**
	 * Obtain device services, them read characteristics and descriptors
	 * for the services with the given uuid(s).
	 * If serviceUUIDs is null, info is read for all services.
 	 * Called from evothings.easyble.EasyBLEDevice.
	 * @private
	 */
	internal.readServices = function(device, serviceUUIDs, success, fail)
	{
		// Read services.
		evothings.ble.services(
			device.deviceHandle,
			function(services)
			{
				// Array that stores services.
				device.__services = [];

				for (var i = 0; i < services.length; ++i)
				{
					var service = services[i];
					service.uuid = service.uuid.toLowerCase();
					device.__services.push(service);
					device.__uuidMap[service.uuid] = service;
				}

				internal.readCharacteristicsForServices(
					device, serviceUUIDs, success, fail);
			},
			function(errorCode)
			{
				fail(errorCode);
			});
	};

	/**
	 * Read characteristics and descriptors for the services with the given uuid(s).
	 * If serviceUUIDs is null, info for all services are read.
	 * Internal function.
 	 * Called from evothings.easyble.EasyBLEDevice.
	 * @private
	 */
	internal.readCharacteristicsForServices = function(device, serviceUUIDs, success, fail)
	{
		var characteristicsCallbackFun = function(service)
		{
			// Array with characteristics for service.
			service.__characteristics = [];

			return function(characteristics)
			{
				--readCounter; // Decrements the count added by services.
				readCounter += characteristics.length;
				for (var i = 0; i < characteristics.length; ++i)
				{
					var characteristic = characteristics[i];
					characteristic.uuid = characteristic.uuid.toLowerCase();
					service.__characteristics.push(characteristic);
					device.__uuidMap[characteristic.uuid] = characteristic;
					device.__serviceMap[service.uuid + ':' + characteristic.uuid] = characteristic;

					// DEBUG LOG
					//console.log('storing service:characteristic key: ' + service.uuid + ':' + characteristic.uuid);
					//if (!characteristic)
					//{
					//	console.log('  --> characteristic is null!')
					//}

					// Read descriptors for characteristic.
					evothings.ble.descriptors(
						device.deviceHandle,
						characteristic.handle,
						descriptorsCallbackFun(service, characteristic),
						function(errorCode)
						{
							fail(errorCode);
						});
				}
			};
		};

 		/**
	 	 * @private
	 	 */
		var descriptorsCallbackFun = function(service, characteristic)
		{
			// Array with descriptors for characteristic.
			characteristic.__descriptors = [];

			return function(descriptors)
			{
				--readCounter; // Decrements the count added by characteristics.
				for (var i = 0; i < descriptors.length; ++i)
				{
					var descriptor = descriptors[i];
					descriptor.uuid = descriptor.uuid.toLowerCase();
					characteristic.__descriptors.push(descriptor);
					device.__uuidMap[characteristic.uuid + ':' + descriptor.uuid] = descriptor;
					device.__serviceMap[service.uuid + ':' + characteristic.uuid + ':' + descriptor.uuid] = descriptor;
				}
				if (0 == readCounter)
				{
					// Everything is read.
					success(device);
				}
			};
		};

		// Initialize read counter.
		readCounter = 0;

		if (null != serviceUUIDs)
		{
			// Read info for service UUIDs.
			readCounter = serviceUUIDs.length;
			for (var i = 0; i < serviceUUIDs.length; ++i)
			{
				var uuid = serviceUUIDs[i].toLowerCase();
				var service = device.__uuidMap[uuid];
				if (!service)
				{
					fail(evothings.easyble.error.SERVICE_NOT_FOUND + ' ' + uuid);
					return;
				}

				// Read characteristics for service. Will also read descriptors.
				evothings.ble.characteristics(
					device.deviceHandle,
					service.handle,
					characteristicsCallbackFun(service),
					function(errorCode)
					{
						fail(errorCode);
					});
			}
		}
		else
		{
			// Read info for all services.
			readCounter = device.__services.length;
			for (var i = 0; i < device.__services.length; ++i)
			{
				// Read characteristics for service. Will also read descriptors.
				var service = device.__services[i];
				evothings.ble.characteristics(
					device.deviceHandle,
					service.handle,
					characteristicsCallbackFun(service),
					function(errorCode)
					{
						fail(errorCode);
					});
			}
		}
	};

 	/**
 	 * Called from evothings.easyble.EasyBLEDevice.
	 * @deprecated Naming is a bit confusing, internally functions
	 * named "xxxServiceYYY" are the "future-safe" onces, but in
	 * the public API functions "xxxYYY" are new "future-safe"
	 * (and backwards compatible).
	 * @private
	 */
	internal.readCharacteristic = function(device, characteristicUUID, success, fail)
	{
		characteristicUUID = characteristicUUID.toLowerCase();

		var characteristic = device.__uuidMap[characteristicUUID];
		if (!characteristic)
		{
			fail(evothings.easyble.error.CHARACTERISTIC_NOT_FOUND + ' ' +
				characteristicUUID);
			return;
		}

		evothings.ble.readCharacteristic(
			device.deviceHandle,
			characteristic.handle,
			success,
			fail);
	};

	/**
	 * Called from evothings.easyble.EasyBLEDevice.
	 * @private
	 */
	internal.readServiceCharacteristic = function(
		device, serviceUUID, characteristicUUID, success, fail)
	{
		var key = serviceUUID.toLowerCase() + ':' + characteristicUUID.toLowerCase();

		var characteristic = device.__serviceMap[key];
		if (!characteristic)
		{
			fail(evothings.easyble.error.CHARACTERISTIC_NOT_FOUND + ' ' + key);
			return;
		}

		evothings.ble.readCharacteristic(
			device.deviceHandle,
			characteristic.handle,
			success,
			fail);
	};

 	/**
 	 * Called from evothings.easyble.EasyBLEDevice.
	 * @deprecated Naming is a bit confusing, internally functions
	 * named "xxxServiceYYY" are the "future-safe" onces, but in
	 * the public API functions "xxxYYY" are new "future-safe"
	 * (and backwards compatible).
	 * @private
	 */
	internal.readDescriptor = function(
		device, characteristicUUID, descriptorUUID, success, fail)
	{
		characteristicUUID = characteristicUUID.toLowerCase();
		descriptorUUID = descriptorUUID.toLowerCase();

		var descriptor = device.__uuidMap[characteristicUUID + ':' + descriptorUUID];
		if (!descriptor)
		{
			fail(evothings.easyble.error.DESCRIPTOR_NOT_FOUND + ' ' + descriptorUUID);
			return;
		}

		evothings.ble.readDescriptor(
			device.deviceHandle,
			descriptor.handle,
			success,
			fail);
	};

	/**
	 * Called from evothings.easyble.EasyBLEDevice.
	 * @private
	 */
	internal.readServiceDescriptor = function(
		device, serviceUUID, characteristicUUID, descriptorUUID, success, fail)
	{
		var key = serviceUUID.toLowerCase() + ':' +
			characteristicUUID.toLowerCase() + ':' +
			descriptorUUID.toLowerCase();

		var descriptor = device.__serviceMap[key];
		if (!descriptor)
		{
			fail(evothings.easyble.error.DESCRIPTOR_NOT_FOUND + ' ' + key);
			return;
		}

		evothings.ble.readDescriptor(
			device.deviceHandle,
			descriptor.handle,
			success,
			fail);
	};

 	/**
 	 * Called from evothings.easyble.EasyBLEDevice.
	 * @deprecated Naming is a bit confusing, internally functions
	 * named "xxxServiceYYY" are the "future-safe" onces, but in
	 * the public API functions "xxxYYY" are new "future-safe"
	 * (and backwards compatible).
	 * @private
	 */
	internal.writeCharacteristic = function(
		device, characteristicUUID, value, success, fail)
	{
		characteristicUUID = characteristicUUID.toLowerCase();

		var characteristic = device.__uuidMap[characteristicUUID];
		if (!characteristic)
		{
			fail(evothings.easyble.error.CHARACTERISTIC_NOT_FOUND + ' ' +
				characteristicUUID);
			return;
		}

		evothings.ble.writeCharacteristic(
			device.deviceHandle,
			characteristic.handle,
			value,
			function()
			{
				success();
			},
			function(errorCode)
			{
				fail(errorCode);
			});
	};

	/**
	* Called from evothings.easyble.EasyBLEDevice.
	* @private
	*/
	internal.writeServiceCharacteristic = function(
		device, serviceUUID, characteristicUUID, value, success, fail)
	{
		var key = serviceUUID.toLowerCase() + ':' + characteristicUUID.toLowerCase();

		var characteristic = device.__serviceMap[key];
		if (!characteristic)
		{
			fail(evothings.easyble.error.CHARACTERISTIC_NOT_FOUND + ' ' + key);
			return;
		}

		evothings.ble.writeCharacteristic(
			device.deviceHandle,
			characteristic.handle,
			value,
			success,
			fail);
	};

	/**
	* Called from evothings.easyble.EasyBLEDevice.
	* @private
	*/
	internal.writeServiceCharacteristicWithoutResponse = function(
		device, serviceUUID, characteristicUUID, value, success, fail)
	{
		var key = serviceUUID.toLowerCase() + ':' + characteristicUUID.toLowerCase();

		// DEBUG LOG
		//console.log('internal.writeServiceCharacteristicWithoutResponse key: ' + key)
		//console.log('internal.writeServiceCharacteristicWithoutResponse serviceMap:')
		for (var theKey in device.__serviceMap)
		{
			console.log('  ' + theKey);
		}

		var characteristic = device.__serviceMap[key];
		if (!characteristic)
		{
			fail(evothings.easyble.error.CHARACTERISTIC_NOT_FOUND + ' ' + key);
			return;
		}

		evothings.ble.writeCharacteristicWithoutResponse(
			device.deviceHandle,
			characteristic.handle,
			value,
			success,
			fail);
	};

 	/**
 	 * Called from evothings.easyble.EasyBLEDevice.
	 * @deprecated Naming is a bit confusing, internally functions
	 * named "xxxServiceYYY" are the "future-safe" onces, but in
	 * the public API functions "xxxYYY" are new "future-safe"
	 * (and backwards compatible).
	 * @private
	 */
	internal.writeDescriptor = function(
		device, characteristicUUID, descriptorUUID, value, success, fail)
	{
		characteristicUUID = characteristicUUID.toLowerCase();
		descriptorUUID = descriptorUUID.toLowerCase();

		var descriptor = device.__uuidMap[characteristicUUID + ':' + descriptorUUID];
		if (!descriptor)
		{
			fail(evothings.easyble.error.DESCRIPTOR_NOT_FOUND + ' ' + descriptorUUID);
			return;
		}

		evothings.ble.writeDescriptor(
			device.deviceHandle,
			descriptor.handle,
			value,
			function()
			{
				success();
			},
			function(errorCode)
			{
				fail(errorCode);
			});
	};

	/**
	 * Called from evothings.easyble.EasyBLEDevice.
	 * @private
	 */
	internal.writeServiceDescriptor = function(
		device, serviceUUID, characteristicUUID, descriptorUUID, value, success, fail)
	{
		var key = serviceUUID.toLowerCase() + ':' +
			characteristicUUID.toLowerCase() + ':' +
			descriptorUUID.toLowerCase();

		var descriptor = device.__serviceMap[key];
		if (!descriptor)
		{
			fail(evothings.easyble.error.DESCRIPTOR_NOT_FOUND + ' ' + key);
			return;
		}

		evothings.ble.writeDescriptor(
			device.deviceHandle,
			descriptor.handle,
			value,
			success,
			fail);
	};

 	/**
 	 * Called from evothings.easyble.EasyBLEDevice.
	 * @deprecated Naming is a bit confusing, internally functions
	 * named "xxxServiceYYY" are the "future-safe" onces, but in
	 * the public API functions "xxxYYY" are new "future-safe"
	 * (and backwards compatible).
	 * @private
	 */
	internal.enableNotification = function(
		device, characteristicUUID, success, fail, options)
	{
		characteristicUUID = characteristicUUID.toLowerCase();

		var characteristic = device.__uuidMap[characteristicUUID];
		if (!characteristic)
		{
			fail(evothings.easyble.error.CHARACTERISTIC_NOT_FOUND + ' ' +
				characteristicUUID);
			return;
		}

console.log('internal.enableNotification characteristic: ' + JSON.stringify(characteristic))

		evothings.ble.enableNotification(
			device.deviceHandle,
			characteristic.handle,
			success,
			fail,
			options);
	};

	/**
	 * Called from evothings.easyble.EasyBLEDevice.
	 * @private
	 */
	internal.enableServiceNotification = function(
		device, serviceUUID, characteristicUUID, success, fail, options)
	{
		var key = serviceUUID.toLowerCase() + ':' + characteristicUUID.toLowerCase();

		var characteristic = device.__serviceMap[key];
		if (!characteristic)
		{
			fail(evothings.easyble.error.CHARACTERISTIC_NOT_FOUND + ' ' + key);
			return;
		}

console.log('internal.enableServiceNotification characteristic: ' + JSON.stringify(characteristic))

		evothings.ble.enableNotification(
			device.deviceHandle,
			characteristic.handle,
			success,
			fail,
			options);
	};

 	/**
 	 * Called from evothings.easyble.EasyBLEDevice.
	 * @deprecated Naming is a bit confusing, internally functions
	 * named "xxxServiceYYY" are the "future-safe" onces, but in
	 * the public API functions "xxxYYY" are new "future-safe"
	 * (and backwards compatible).
	 * @private
	 */
	internal.disableNotification = function(
		device, characteristicUUID, success, fail, options)
	{
		characteristicUUID = characteristicUUID.toLowerCase();

		var characteristic = device.__uuidMap[characteristicUUID];
		if (!characteristic)
		{
			fail(evothings.easyble.error.CHARACTERISTIC_NOT_FOUND + ' ' +
				characteristicUUID);
			return;
		}

		evothings.ble.disableNotification(
			device.deviceHandle,
			characteristic.handle,
			success,
			fail,
			options);
	};

	/**
	 * Called from evothings.easyble.EasyBLEDevice.
	 * @private
	 */
	internal.disableServiceNotification = function(
		device, serviceUUID, characteristicUUID, success, fail, options)
	{
		var key = serviceUUID.toLowerCase() + ':' + characteristicUUID.toLowerCase();

		var characteristic = device.__serviceMap[key];
		if (!characteristic)
		{
			fail(evothings.easyble.error.CHARACTERISTIC_NOT_FOUND + ' ' + key);
			return;
		}

		evothings.ble.disableNotification(
			device.deviceHandle,
			characteristic.handle,
			success,
			fail,
			options);
	};

	/**
	 * Prints and object for debugging purposes.
	 * @deprecated. Defined here for backwards compatibility.
	 * Use evothings.printObject().
	 * @public
	 */
	evothings.easyble.printObject = evothings.printObject;

 	/**
 	 * Reset the BLE hardware. Can be time consuming.
	 * @public
	 */
	evothings.easyble.reset = function()
	{
		evothings.ble.reset();
	};
})();
