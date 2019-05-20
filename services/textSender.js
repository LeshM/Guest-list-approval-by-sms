const config = require('../config');
const Nexmo = require('simple-nexmo');
const phone = require('phone');
const NEXMO_KEY = process.env.NEXMO_KEY;
const NEXMO_SECRET = process.env.NEXMO_SECRET;

var queue = [];
var promise = null;

function createClient(apiKey, apiSecret) {
    // TODO: replace these lines in order to use the client keys instead of the system keys
    // return new Nexmo({apiKey: apiKey, apiSecret: apiSecret});
    return new Nexmo({apiKey: NEXMO_KEY, apiSecret: NEXMO_SECRET});
}

function startQueue() {
    if (!promise) {
        promise = setInterval(function () {
            var queueItem = queue.pop();

            createClient(queueItem.apiKey, queueItem.apiSecret).sendSMSMessage({
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
}

exports.sendSMSMessage = function (apiKey, apiSecret, smsSenderNumber, phoneNumber, sms) {
    return new Promise((resolve, reject) => {
        phoneNumber = phone(phoneNumber, config.defaultCountry);

        queue.push({
            apiKey: apiKey,
            apiSecret: apiSecret,
            smsSenderNumber: smsSenderNumber,
            phoneNumber: phoneNumber,
            sms: sms,
            callback: function (err, response) {
                if (err) {
                    reject(err.message || err);
                } else {
                    console.log(response);
                    resolve(response);
                }
            }
        });

        startQueue();
    });
};

exports.getBalance = function (apiKey, apiSecret) {
    return new Promise((resolve, reject) => {
        createClient(apiKey, apiSecret).getBalance(function (err, response) {
            if (err) {
                reject(err.message || err);
            } else {
                resolve((response || {}).value || 0);
            }
        })
    });
};
