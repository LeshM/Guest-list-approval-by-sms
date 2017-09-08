const config = require('../config');
const Nexmo = require('simple-nexmo');
const Q = require('q');
const phone = require('phone');

var queue = [];
var promise = null;
var startQueue = function () {
    if (!promise) {
        promise = setInterval(function () {
            var queueItem = queue.pop();

            new Nexmo({apiKey: queueItem.apiKey, apiSecret: queueItem.apiSecret}).sendSMSMessage({
                from: queueItem.smsSenderNumber,
                to: queueItem.phoneNumber,
                text: queueItem.sms,
                type: 'unicode'
            }, queueItem.callback);


            if (!queue.length) {
                clearInterval(promise);
                promise = null;
            }
        }, 2500);
    }
};

exports.sendSMSMessage = function (apiKey, apiSecret, smsSenderNumber, phoneNumber, sms) {
    var defer = Q.defer();

    phoneNumber = phone(phoneNumber, config.defaultCountry);

    queue.push({
        apiKey: apiKey,
        apiSecret: apiSecret,
        smsSenderNumber: smsSenderNumber,
        phoneNumber: phoneNumber,
        sms: sms,
        callback: function (err, response) {
            if (err) {
                defer.reject(err.message || err);
            } else {
                console.log(response);
                defer.resolve(response);
            }
        }
    });

    startQueue();

    return defer.promise;
};