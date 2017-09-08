const mongoose = require('mongoose');
const google = require('googleapis');
const sheets = google.sheets('v4');
const googleAuth = require('google-auth-library');
const googleSettings = require('../config/google-settings');
const Q = require('q');
const excelColumnName = require('excel-column-name');
const Sheet = mongoose.model('Sheet');

// If modifying these scopes, delete your previously saved credentials
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

exports.authenticate = function (sheetId, authCode) {
    var defer = Q.defer();

    var clientSecret = googleSettings.client_secret;
    var clientId = googleSettings.client_id;
    var redirectUrl = googleSettings.redirect_uris[0];
    var auth = new googleAuth();
    var authClient = new auth.OAuth2(clientId, clientSecret, redirectUrl);

    if (authCode) {
        authClient.getToken(authCode, function (err, token) {
            if (err) {
                defer.reject(err);
            } else {
                authClient.credentials = token;

                Sheet.findOneAndUpdate({sheetId: sheetId}, {$set: {token: token}}, {upsert: true})
                    .then(function () {
                        defer.resolve(authClient);
                    })
                    .catch(defer.reject);
            }
        });
    } else {
        Sheet.findOne({sheetId: sheetId, token: {$exists: true}})
            .lean()
            .exec()
            .then(function (sheet) {
                if (!sheet) {
                    defer.reject({status: 401, authClient: authClient});
                } else {
                    authClient.credentials = sheet.token;
                    defer.resolve(authClient);
                }
            })
            .catch(defer.reject);
    }

    return defer.promise;
};

exports.authenticateMiddleware = function (req, res, next) {
    req.authCode = req.body.authCode;

    exports.authenticate(req.sheetId, req.authCode)
        .then(function (authClient) {
            req.authClient = authClient;
            next();
        })
        .catch(function (err) {
            if (err && err.status == 401) {
                res.status(401).json({authUrl: err.authClient.generateAuthUrl({access_type: 'offline', scope: SCOPES})});
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
            defer.reject('The API returned an error: ' + err);
        } else {
            var values = response.values;
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