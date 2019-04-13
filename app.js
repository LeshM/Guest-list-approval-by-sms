require('./models/sheet');
const config = require('./config');
const utils = require('./utils');
const express = require('express');
const logger = require('morgan');
const bodyParser = require('body-parser');
const http = require('http');
const path = require('path');
const favicon = require('serve-favicon');
const googleController = require('./controllers/googleController');
const sheetController = require('./controllers/sheetContoller');
const messageController = require('./controllers/messageController');
const guestController = require('./controllers/guestController');
const mongoose = require('mongoose');
const request = require('request');

mongoose.Promise = require('q').Promise;
mongoose.connect(config.mongoDB, {useNewUrlParser: true});

http.globalAgent.maxSockets = Infinity;

const app = express();
app.use(logger('dev'));
app.use(favicon('favicon.ico'));
app.use(require('express-domain-middleware'));
app.use(bodyParser.json({limit: '4mb'}));
app.use(bodyParser.urlencoded({extended: true}));

const router = express.Router();

router.post('/read-data', googleController.sanitizeSheetUrl, googleController.authenticateMiddleware, sheetController.findSheetBySheetId, function (req, res, next) {
    googleController.getSpreadSheetData(req.authClient, req.sheetId, req.body.headerRow)
        .then(function (result) {
            result.sheetData = req.sheetDoc;
            res.status(200).json(result);
        })
        .catch(function (err) {
            if (err.authUrl) {
                res.status(401).send(err);
            } else {
                next(err);
            }
        });
});

router.post('/import-data', googleController.sanitizeSheetUrl, googleController.authenticateMiddleware, sheetController.findSheetBySheetId, async function (req, res, next) {
    try {
        var sheetData = await googleController.getSpreadSheetData(req.authClient, req.sheetId, req.body.headerRow);
        var sheet = await guestController.importGuests(
            req.sheetDoc,
            sheetData,
            req.body.nameColumnIndex,
            req.body.phoneNumberColumnIndex,
            req.body.guestCountColumnIndex,
            req.body.approvedGuestCountColumnIndex,
            req.body.approvedKidCountColumnIndex);

        sheet = sheet.toObject();
        sheet.guests.forEach(function (guest) {
            guest.messages = guestController.mergeGuestMessages(guest);
            utils.flattenObjectField(guest, 'gift');
        });

        res.status(200).json(sheet);
    } catch (e) {
        next(e);
    }
});

router.put('/field/:fieldName/:fieldValue?', googleController.sanitizeSheetUrl, sheetController.updateColumnMiddleware, function (req, res) {
    switch (req.params.fieldName) {
        case 'venueLatLon':
            request.post('https://www.googleapis.com/urlshortener/v1/url?key=AIzaSyCbBtrzRfUOUh3ln_aV31Pm4GCVtO6IkKk', {
                    json: true,
                    body: {longUrl: 'https://waze.com/ul?ll=' + req.params.fieldValue}
                },
                function (err, response, responseBody) {
                    if (err || !response || response.statusCode != 200) {
                        console.error(err || 'failed shortening url');
                    } else {
                        sheetController.updateColumn(req.sheetId, 'venueLocationUrl', responseBody.id);
                    }
                });

            break;
    }

    res.status(200).end();
});

router.put('/guest/:guestId/:fieldName?', googleController.sanitizeSheetUrl, sheetController.updateGuestField);

router.post('/send/:to', messageController.sendMessage);

router.get('/sms', messageController.receiveMessage);

router.post('/sms', messageController.receiveMessage);

router.post('/delivery', messageController.confirmMessageDelivery);

app.use('/', express.static(path.resolve(__dirname, './public')));
app.use(router);

app.use(function (err, req, res, next) {
    if (!err) {
        next();
    } else {
        console.error(err);
        res.status(500).json(err.message || err);
    }
});

app.use(function (req, res) {
    res.status(404).json('Not Found');
});

var server = http.createServer(app);
server.listen(config.port);
server.on('listening', function () {
    console.log('Listening on http://localhost' + (config.port !== 80 ? ':' + config.port : ''));
});

process.on('SIGTERM', function (err) {
    console.error('SIGTERM: ' + err);

    server.close(function () {
        process.exit(0);
    });
});
