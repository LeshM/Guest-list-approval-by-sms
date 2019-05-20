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
                    .then(() => deferred.resolve(response))
                    .catch(deferred.reject);
            })
            .catch(deferred.reject);
    }

    return deferred.promise;
}

exports.sendMessageToGuest = function (phone, message, smsSenderNumber, isOnlyToUnsentNumbers, isOnlyToApprovedGuests, isOnlyToGuestsWithNoAnswer, isOnlyToGuestsWhoBroughtGifts) {
    var deferred = Q.defer();

    sheetCont.findSheetByGuestPhone(phone)
        .then(function (sheet) {
            if (!sheet) {
                deferred.reject({status: 403, message: 'לא נמצא אורח עם הטלפון: ' + phone});
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

exports.sendMessage = async function (req, res, next) {
    var phone = utils.sanitizePhoneNumber(req.params.to);
    var message = req.query.message || req.body.message;
    var smsSenderNumber = req.query.smsSenderNumber || req.body.smsSenderNumber;
    var isOnlyToUnsentNumbers = req.query.isOnlyToUnsentNumbers || req.body.isOnlyToUnsentNumbers;
    var isOnlyToApprovedGuests = req.query.isOnlyToApprovedGuests || req.body.isOnlyToApprovedGuests;
    var isOnlyToGuestsWithNoAnswer = req.query.isOnlyToGuestsWithNoAnswer || req.body.isOnlyToGuestsWithNoAnswer;
    var isOnlyToGuestsWhoBroughtGifts = req.query.isOnlyToGuestsWhoBroughtGifts || req.body.isOnlyToGuestsWhoBroughtGifts;

    try {
        var response = await messageController.sendMessageToGuest(phone, message, smsSenderNumber, isOnlyToUnsentNumbers, isOnlyToApprovedGuests, isOnlyToGuestsWithNoAnswer, isOnlyToGuestsWhoBroughtGifts);
        var remainingBalance;

        if (response && response.messages && response.messages.length && response.messages[0]) {
            remainingBalance = response.messages[0]['remaining-balance'];
        }

        res.status(200).json({remainingBalance: remainingBalance});
    } catch (e) {
        if (e && e.status) {
            res.status(e.status).json(e);
        } else {
            next(e);
        }
    }
};

exports.receiveMessage = async function (req, res, next) {
    var messageId = req.query.messageId || req.body.messageId;
    var phone = (req.query.msisdn || req.body.msisdn || '').replace(config.defaultCountryCode, '');
    var messageText = req.query.text || req.body.text;
    var smsSenderNumber = req.query.to || req.body.to;

    try {
        var sheet = await sheetCont.findSheetByGuestPhone(phone);

        if (!sheet) {
            next(`no sheet doc - messageId: ${messageId}, phone: ${phone}, smsSenderNumber: ${smsSenderNumber}, messageText: "${messageText}"`);
        } else {
            res.status(200).end();

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

                        var isSendApprovalMessage = false;
                        var approvedCount = guest.approvedGuestCount || 0;
                        var approvedKidCount = guest.approvedKidCount || 0;
                        var numbers = /(\d\s*[א-ת]*)\s*[א-ת]?\s*-?\s*(\d\s*[א-ת]*)?/g.exec(messageText);
                        if (numbers && numbers.length) {
                            // Remove the input result
                            numbers.shift();
                        }

                        if (numbers && numbers.length > 1) {
                            numbers.forEach(numberRegex => {
                                if (/ילד/.test(numberRegex)) {
                                    approvedKidCount = approvedKidCount || parseInt(numberRegex || 0);
                                } else {
                                    approvedCount = approvedCount || parseInt(numberRegex || 0);
                                }
                            });

                            if (/ילד/.test(messageText) && !approvedKidCount) {
                                approvedKidCount = 1;
                            }

                            isSendApprovalMessage = true;
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

                        if (!isNaN(approvedKidCount)) {
                            guest.approvedKidCount = approvedKidCount;
                        }

                        try {
                            if (isSendApprovalMessage) {
                                await sendMessageToGuestAndUpdateSheet(sheet, guest, sheet.approval, smsSenderNumber, false, true);
                            }

                            await sheet.save();
                        } catch (e) {
                            next(e);
                        }

                        return;
                    }
                }
            }

            next('לא נמצא אורח עם הטלפון: ' + phone);
        }
    } catch (e) {
        next(e);
    }
};

exports.confirmMessageDelivery = function (req, res) {
    console.log('delivery', req.body);

    res.status(200).end();
};

exports.getBalance = sender.getBalance;
