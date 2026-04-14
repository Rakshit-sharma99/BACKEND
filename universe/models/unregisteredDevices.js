const mongoose = require('mongoose');

const unregisteredDevicesSchema = new mongoose.Schema({
  fcmToken: { type: String, unique: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('UnregisteredDevices', unregisteredDevicesSchema);
