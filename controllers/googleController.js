const mongoose = require('mongoose');
const {google} = require('googleapis');
const {auth} = require('google-auth-library');
const sheets = google.sheets({version: 'v4', auth});
const googleSettings = require('../config/google-settings');
const Q = require('q');
const excelColumnName = require('excel-column-name');
const Sheet = mongoose.model('Sheet');
const moment = require('moment');

// If modifying these scopes, delete your previously saved credentials
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function authenticateSheet(req) {
    return new Promise((resolve, reject) => {
        var sheetId = req.sheetId;
        var authCode = req.authCode;
        req.authClient = new google.auth.OAuth2(googleSettings.client_id, googleSettings.client_secret, googleSettings.redirect_uris[0]);

        if (authCode) {
            req.authClient.getToken(authCode, (err, token) => {
                if (err) {
                    reject(err);
                } else {
                    req.authClient.credentials = token;

                    Sheet.findOneAndUpdate({sheetId: sheetId}, {$set: {token: token}}, {upsert: true})
                        .then(resolve)
                        .catch(reject);
                }
            });
        } else {
            Sheet.findOne({sheetId: sheetId, token: {$exists: true}})
                .lean()
                .exec()
                .then(function (sheet) {
                    if (!sheet || moment().isAfter(sheet.token.expiry_date)) {
                        reject({status: 401, message: 'expired'});
                    } else {
                        req.authClient.credentials = sheet.token;
                        resolve();
                    }
                })
                .catch(reject);
        }
    });
}

exports.authenticateMiddleware = function (req, res, next) {
    req.authCode = req.body.authCode;

    authenticateSheet(req)
        .then(() => next())
        .catch(function (err) {
            if (err && (err.status == 401 || err.code == 400)) {
                res.status(401).json({
                    authUrl: req.authClient.generateAuthUrl({access_type: 'offline', scope: SCOPES})
                });
            } else {
                next(err);
            }
        });
};

exports.sanitizeSheetUrl = function (req, res, next) {
    if (req.body.guestListUrl) {
        req.sheetId = req.body.guestListUrl.replace('https://docs.google.com/spreadsheets/d/', '').split('/')[0];
        next();
    } else {
        res.status(400).json('missing guestListUrl');
    }
};

exports.getSpreadSheetData = function (authClient, sheetId, headerRow) {
    var defer = Q.defer();

    sheets.spreadsheets.values.get({auth: authClient, spreadsheetId: sheetId, range: 'A:Z'}, function (err, response) {
        if (err) {
            defer.reject(err);
        } else {
            var values = response && response.data && response.data.values;
            if (!values || !values.length) {
                defer.reject('No data found.');
            } else {
                var keys = 0;
                var headers = null;
                var rows = [];
                headerRow = (headerRow || 1) - 1;

                for (var h = 0; h <= headerRow; h++) {
                    headers = values.shift().map(function (header) {
                        return {
                            key: keys++,
                            display: header
                        }
                    });
                }

                for (var v = 0; v < values.length; v++) {
                    var value = values[v];
                    var row = {};

                    for (var i = 0; i < value.length; i++) {
                        if (headers[i]) {
                            row[headers[i].key] = value[i];
                        }
                    }

                    rows.push(row);
                }

                defer.resolve({headers: headers, rows: rows});
            }
        }
    });

    return defer.promise;
};

exports.setSpreadSheetData = function (authClient, sheetId, updateColumn, updateRow, updateValue) {
    var defer = Q.defer();

    // Add 1 because the columns are 1 based and not 0 based
    var column = excelColumnName.intToExcelCol(Number(updateColumn) + 1);

    // Add 1 because the rows are 1 based and not 0 based, and another 1 to skip the headers
    var row = (Number(updateRow) + 2);

    sheets.spreadsheets.values.update({
        auth: authClient,
        spreadsheetId: sheetId,
        range: 'Sheet1!' + column + row,
        valueInputOption: 'USER_ENTERED',
        includeValuesInResponse: true,
        resource: {values: [[updateValue]]}
    }, function (err, response) {
        if (err) {
            defer.reject(err);
        } else {
            defer.resolve(response);
        }
    });

    return defer.promise;
};
