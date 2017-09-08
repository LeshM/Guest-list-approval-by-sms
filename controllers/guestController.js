const Q = require('q');
const utils = require('../utils');
const sheetController = require('./sheetContoller');

exports.importGuests = function (sheetDoc, sheetData, nameColumnIndex, phoneNumberColumnIndex, guestCountColumnIndex, approvedGuestCountColumnIndex) {
    var deferred = Q.defer();

    if (!sheetDoc || !sheetData) {
        deferred.reject();
    } else {
        function handleSheet(sheet) {
            var guests = [];

            sheet.rows.forEach(function (row) {
                var phone = row[phoneNumberColumnIndex];

                // Number with no country code and no leading 0 ~ Number with country code, '+' sign and a leading 0
                if (phone) {
                    phone = utils.sanitizePhoneNumber(phone);

                    if (/\d{9,15}/g.test(phone)) {
                        guests.push({
                            name: row[nameColumnIndex],
                            phoneNumber: phone,
                            guestCount: Number(row[guestCountColumnIndex] || 0),
                            approvedGuestCount: Number(row[approvedGuestCountColumnIndex] || 0)
                        });
                    }
                }
            });

            if (!guests.length) {
                deferred.reject('לא נמצאו מספרי טלפון של אורחים');
            } else {
                sheetController.updateGuests(sheetDoc, guests)
                    .then(deferred.resolve)
                    .catch(deferred.reject);
            }
        }

        handleSheet(sheetData);
    }

    return deferred.promise;
};

exports.mergeGuestMessages = function (guest) {
    var messages = [];

    while (guest.messages.toGuest && guest.messages.toGuest.length) {
        var messagesToGuest = guest.messages.toGuest.pop();
        delete messagesToGuest._id;
        messagesToGuest.direction = 'to-guest';
        messages.push(messagesToGuest);
    }

    while (guest.messages.fromGuest && guest.messages.fromGuest.length) {
        var messagesFromGuest = guest.messages.fromGuest.pop();
        delete messagesFromGuest._id;
        messagesFromGuest.direction = 'from-guest';
        messages.push(messagesFromGuest);
    }

    return messages;
};