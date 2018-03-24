const mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
const Sheet = mongoose.model('Sheet');
const Q = require('q');
const utils = require('../utils');

exports.updateColumnMiddleware = function (req, res, next) {
    exports.updateColumn(req.sheetId, req.params.fieldName, req.params.fieldValue)
        .then(function (updatedSheet) {
            if (updatedSheet) {
                updatedSheet[req.params.fieldName] = req.params.fieldValue;
                req.sheetDoc = updatedSheet;
            }
            next();
        })
        .catch(next);
};

exports.updateColumn = function (sheetId, fieldName, fieldValue) {
    var update = {};
    update[fieldName] = fieldValue !== undefined ? fieldValue : '';
    return Sheet.findOneAndUpdate({sheetId: sheetId}, {$set: update})
        .exec();
};

exports.updateGuestField = function (req, res, next) {
    var fieldName = req.params.fieldName;
    var fieldValue = req.body.fieldValue;

    Sheet.findOne({sheetId: req.sheetId})
        .exec()
        .then(function (sheet) {
            var existingGuest;
            if (fieldName == 'phoneNumber') {
                for (var i = sheet.guests.length - 1; i >= 0; i--) {
                    var guest = sheet.guests[i];

                    if (guest[fieldName] == fieldValue) {
                        existingGuest = guest;
                        break;
                    }
                }
            }

            if (existingGuest && (existingGuest._id != req.params.guestId || req.params.guestId == 'new')) {
                res.status(409).json('כבר קיים אורח ברשימה עם מספר זה');
            } else if (req.params.guestId == 'new') {
                var newGuest = {};
                newGuest[fieldName] = fieldValue;
                sheet.guests.push(newGuest);
                sheet.save()
                    .then(function (sheet) {
                        var newGuest;
                        for (var i = sheet.guests.length - 1; i >= 0; i--) {
                            var guest = sheet.guests[i];

                            if (guest[fieldName] == fieldValue) {
                                newGuest = guest;
                                break;
                            }
                        }

                        res.status(200).json(newGuest._id);
                    })
                    .catch(next);
            } else {
                updateGuestInSheet(sheet, '_id', req.params.guestId, function (guest) {
                    utils.setObjectValueByPath(guest, fieldName, fieldValue);
                })
                    .then(function () {
                        res.status(200).end();
                    })
                    .catch(next);
            }
        })
        .catch(next);
};

exports.updateGuests = function (sheet, newGuests) {
    var deferred = Q.defer();

    var newGuestMap = {};

    // Map new guests
    newGuests.forEach(function (newGuest) {
        newGuestMap[newGuest.phoneNumber] = newGuest;
    });

    var existingGuestMap = {};
    sheet.guests = sheet.guests || [];

    for (var i = sheet.guests.length - 1; i >= 0; i--) {
        var existingGuest = sheet.guests[i];

        // Map existing guests that are still in the new guest list
        if (newGuestMap[existingGuest.phoneNumber]) {
            existingGuestMap[existingGuest.phoneNumber] = existingGuest;
        }
    }

    newGuests.forEach(function (newGuest) {
        var existingGuest = existingGuestMap[newGuest.phoneNumber];

        if (existingGuest) {
            // Update existing guest
            existingGuest.name = newGuest.name;
            existingGuest.guestCount = newGuest.guestCount;

            // Only update approved guest count if it was manually updated in the guest list
            if (newGuest.approvedGuestCount) {
                existingGuest.approvedGuestCount = newGuest.approvedGuestCount;
            }
        } else {
            // Add new guest
            sheet.guests.push(newGuest);
        }
    });

    sheet.save()
        .then(deferred.resolve)
        .catch(deferred.reject);

    return deferred.promise;
};

exports.findSheetBySheetId = function (req, res, next) {
    Sheet.findOne({sheetId: req.sheetId})
        .exec()
        .then(function (sheet) {
            req.sheetDoc = sheet;
            next();
        })
        .catch(next);
};

exports.findSheetByGuestPhone = function (guestPhone, smsSenderNumber) {
    return Sheet.findOne({'guests.phoneNumber': guestPhone, smsSenderNumber: smsSenderNumber})
        .exec();
};

exports.saveGuestMessage = function (sheet, guest, message) {
    var deferred = Q.defer();

    guest.sentMessageCount = (guest.sentMessageCount || 0) + 1;
    guest.messages.toGuest.push(message);

    sheet.save()
        .then(deferred.resolve)
        .catch(deferred.reject);

    return deferred.promise;
};

function updateGuestInSheet(sheet, fieldNameToUpdate, fieldValueToUpdate, updateGuestFunction) {
    var deferred = Q.defer();

    var isFound = false;
    for (var i = 0; i < sheet.guests.length; i++) {
        var guest = sheet.guests[i];
        var guestFieldValue = utils.getObjectValueByPath(guest, fieldNameToUpdate);

        if (guestFieldValue == fieldValueToUpdate) {
            updateGuestFunction(guest);
            isFound = true;
            break;
        }
    }

    if (isFound) {
        sheet.save()
            .then(deferred.resolve)
            .catch(deferred.reject);
    } else {
        deferred.resolve();
    }

    return deferred.promise;
}

exports.updateSentMessage = function (sheetId, phone, message) {
    var deferred = Q.defer();

    Sheet.find({sheetId: sheetId, 'guests.phoneNumber': phone})
        .exec()
        .then(function (sheets) {
            Q.allSettled(sheets.map(function (sheet) {
                return updateGuestInSheet(sheet, 'phoneNumber', phone, function (guest) {
                    guest.sentMessageCount = (guest.sentMessageCount || 0) + 1;
                    guest.messages.toGuest.push(message);
                });
            }));
        })
        .catch(deferred.reject);

    return deferred.promise;
};