const sheetCont = require('./sheetContoller');
const messageController = require('./messageController');
const sender = require('../services/textSender');
const config = require('../config');
const utils = require('../utils');
const Q = require('q');

function sendMessageToGuestAndUpdateSheet(sheet, guest, message, smsSenderNumber, isOnlyToUnsentNumbers, isOnlyToApprovedGuests, isOnlyToGuestsWithNoAnswer, isOnlyToGuestsWhoBroughtGifts) {
    var deferred = Q.defer();

    guest.sentMessageCount = guest.sentMessageCount || 0;
    guest.approvedGuestCount = guest.approvedGuestCount || 0;
    var isReplied = guest.approvedGuestCount !== undefined;
    var isGift = !!guest.gift;

    if (guest.isDisabled) {
        deferred.reject('ההודעה לא נשלחה מאחר והאורח מושהה');
    } else if ((isOnlyToUnsentNumbers && guest.sentMessageCount > 0) ||
        (isOnlyToApprovedGuests && guest.approvedGuestCount == 0) ||
        (isOnlyToGuestsWithNoAnswer && (!guest.sentMessageCount || isReplied)) ||
        (isOnlyToGuestsWhoBroughtGifts && !isGift)) {
        // Stop here if only sending to unset numbers and this number already got messages or if only sending to approved guests and this one didn't approve
        deferred.reject('ההודעה לא נשלחה מאחר והיא לא עונה על התנאים שהצבת!');
    } else {
        sender.sendSMSMessage(sheet.apiKey, sheet.apiSecret, smsSenderNumber, guest.phoneNumber, message)
            .then(function (response) {
                sheetCont.saveGuestMessage(sheet, guest, {
                    messageId: response.messageId,
                    messageText: message
                })
                    .then(deferred.resolve)
                    .catch(deferred.reject);
            })
            .catch(deferred.reject);
    }

    return deferred.promise;
}

exports.sendMessageToGuest = function (phone, message, smsSenderNumber, isOnlyToUnsentNumbers, isOnlyToApprovedGuests, isOnlyToGuestsWithNoAnswer, isOnlyToGuestsWhoBroughtGifts) {
    var deferred = Q.defer();

    sheetCont.findSheetByGuestPhone(phone, smsSenderNumber)
        .then(function (sheet) {
            if (!sheet) {
                deferred.reject({status: 403, message: 'phone does not belong to any guest ' + phone});
            } else {
                var isGuestFound = false;

                for (var g = 0; g < sheet.guests.length; g++) {
                    var guest = sheet.guests[g];

                    if (guest.phoneNumber) {
                        guest.phoneNumber = utils.sanitizePhoneNumber(guest.phoneNumber);

                        if (new RegExp(phone).test(guest.phoneNumber)) {
                            isGuestFound = true;

                            sendMessageToGuestAndUpdateSheet(sheet, guest, message, smsSenderNumber, isOnlyToUnsentNumbers, isOnlyToApprovedGuests, isOnlyToGuestsWithNoAnswer, isOnlyToGuestsWhoBroughtGifts)
                                .then(deferred.resolve)
                                .catch(deferred.reject);

                            break;
                        }
                    }
                }

                if (!isGuestFound) {
                    deferred.reject();
                }
            }
        })
        .catch(deferred.reject);

    return deferred.promise;
};

exports.sendMessage = function (req, res, next) {
    var phone = utils.sanitizePhoneNumber(req.params.to);
    var message = req.query.message || req.body.message;
    var smsSenderNumber = req.query.smsSenderNumber || req.body.smsSenderNumber;
    var isOnlyToUnsentNumbers = req.query.isOnlyToUnsentNumbers || req.body.isOnlyToUnsentNumbers;
    var isOnlyToApprovedGuests = req.query.isOnlyToApprovedGuests || req.body.isOnlyToApprovedGuests;
    var isOnlyToGuestsWithNoAnswer = req.query.isOnlyToGuestsWithNoAnswer || req.body.isOnlyToGuestsWithNoAnswer;
    var isOnlyToGuestsWhoBroughtGifts = req.query.isOnlyToGuestsWhoBroughtGifts || req.body.isOnlyToGuestsWhoBroughtGifts;

    messageController.sendMessageToGuest(phone, message, smsSenderNumber, isOnlyToUnsentNumbers, isOnlyToApprovedGuests, isOnlyToGuestsWithNoAnswer, isOnlyToGuestsWhoBroughtGifts)
        .then(function () {
            res.status(200).end();
        })
        .catch(function (err) {
            if (err && err.status) {
                res.status(err.status).json(err);
            } else {
                next(err);
            }
        });
};

exports.receiveMessage = function (req, res, next) {
    var messageId = req.query.messageId || req.body.messageId;
    var phone = (req.query.msisdn || req.body.msisdn || '').replace(config.defaultCountryCode, '');
    var messageText = req.query.text || req.body.text;
    var smsSenderNumber = req.query.to || req.body.to;

    sheetCont.findSheetByGuestPhone(phone, smsSenderNumber)
        .then(function (sheet) {
            if (!sheet) {
                next('no sheet doc');
            } else {
                for (var g = 0; g < sheet.guests.length; g++) {
                    var guest = sheet.guests[g];

                    if (guest.phoneNumber) {
                        guest.phoneNumber = utils.sanitizePhoneNumber(guest.phoneNumber);

                        // This is the phone's row
                        if (new RegExp(phone).test(guest.phoneNumber)) {
                            guest.messages.fromGuest.push({
                                messageId: messageId,
                                messageText: messageText
                            });

                            var approvedCount = guest.approvedGuestCount || 0;
                            var numbers = /\d+/g.exec(messageText);
                            var isSendApprovalMessage = false;

                            if (numbers && numbers.length == 1) {
                                approvedCount = Number(numbers[0]);

                                isSendApprovalMessage = true;

                                if (approvedCount < 0 || approvedCount > 100) {
                                    approvedCount = guest.guestCount;
                                    exports.sendMessageToGuest(sheet, guest, 'זה בסדר, כבר עשינו בדיקות 😈', smsSenderNumber);
                                }
                            } else if (/צמחוני/.test(messageText)) {
                                guest.mealType = 'צמחונית';
                            } else if (/טבעוני/.test(messageText)) {
                                guest.mealType = 'טבעונית';
                            } else {
                                approvedCount = undefined;
                            }

                            if (!isNaN(approvedCount)) {
                                guest.approvedGuestCount = approvedCount;
                            }

                            if (isSendApprovalMessage) {
                                sendMessageToGuestAndUpdateSheet(sheet, guest, sheet.approval, smsSenderNumber, false, true)
                                    .then(function () {
                                        sheet.save()
                                            .then(function () {
                                                res.status(200).end();
                                            })
                                            .catch(next);
                                    })
                                    .catch(next);
                            } else {
                                sheet.save()
                                    .then(function () {
                                        res.status(200).end();
                                    })
                                    .catch(next)
                            }

                            return;
                        }
                    }
                }

                next('No guest found for phone: ' + phone);
            }
        })
        .catch(next);
};

exports.confirmMessageDelivery = function (req, res) {
    console.log('delivery', req.body);

    res.status(200).end();
};