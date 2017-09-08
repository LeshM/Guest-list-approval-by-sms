angular.module('wedApp', ['ngMaterial', 'webStorageModule', 'alertConfirm', 'md.data.table', 'googlePlaces', 'ngMaterialDatePicker', 'ngCsv'])
    .config(['$mdDateLocaleProvider', 'mdcDatetimePickerDefaultLocaleProvider', '$mdThemingProvider', function ($mdDateLocaleProvider, mdcDatetimePickerDefaultLocale, $mdThemingProvider) {
        mdcDatetimePickerDefaultLocale.setDefaultLocale('he');
        moment.locale('he_IL');

        // Example of a French localization.
        $mdDateLocaleProvider.months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
        $mdDateLocaleProvider.shortMonths = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
        $mdDateLocaleProvider.days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        $mdDateLocaleProvider.shortDays = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

        // Can change week display to start on Sunday.
        $mdDateLocaleProvider.firstDayOfWeek = 0;

        $mdThemingProvider.theme('default')
            .primaryPalette('blue')
            .accentPalette('blue');
        // .dark();
    }])
    .controller('messageController', ['$scope', '$mdToast', 'webStorage', 'alertConfirm', '$http', '$window', '$sce', '$timeout', '$mdDialog', function ($scope, $mdToast, webStorage, alertConfirm, $http, $window, $sce, $timeout, $mdDialog) {
        $scope.promises = {};
        $scope.guestListUrl = webStorage.get('guestListUrl');
        $scope.headerRow = webStorage.get('headerRow');
        $scope.isOnlyToUnsentNumbers = true;
        $scope.today = moment().startOf('day').toDate();
        $scope.eventDate = $scope.today;
        $scope.templateOrManual = 'template';
        $scope.rowsPage = 10;
        $scope.rowsToShow = $scope.rowsPage;
        $scope.defaultMessageTypes = {
            invite: 'היי :GUEST:! 😎 אנו מזמינים אותך לחתונה של :COUPLE: ביום :EVENT_DATE: ב":VENUE:". נודה לך על אישור הגעתך בהשבה להודעה זו עם מספר האורחים שיגיעו (0 אם לא יגיעו). נשמח לראותך 🤘',
            approval: 'תודה רבה! 😍 בכל שינוי, ניתן לשלוח הודעה נוספת למספר זה. במידה ותרצו מנה צמחונית או טבעונית אנא שלחו "צמחונית" / "טבעונית" בכדי שנוכל להיערך מראש :)',
            reminder: 'בוקר טובבבב :GUEST:! מתרגשים לקראת החתונה! 🎉 מזכירים שהיא ב:EVENT_DATE: להוראות הגעה ניתן ללחוץ על הקישור הבא: :VENUE_LOCATION_URL:',
            reminderNoUrl: 'בוקר טובבבב :GUEST:! מתרגשים לקראת החתונה! 🎉 מזכירים שהיא ב:EVENT_DATE: ב:VENUE_LOCATION:',
            thanks: 'בוקר טובבבב :GUEST:! אחרי שהתאוששנו, רצינו להודות לך ששימחת, ריגשת והפכת את היום הזה ליום המאושר בחיינו! תודה, :COUPLE: ❤'
        };
        $scope.messageTypes = angular.copy($scope.defaultMessageTypes);

        function replacePlaceholders(input, guestName, brideAndGroom, eventDate, ceremonyTime, venue, venueLocation, venueLocationUrl) {
            return input
                .replace(/:COUPLE:/g, brideAndGroom)
                .replace(/:EVENT_DATE:/g, eventDate)
                .replace(/:VENUE:/g, venue)
                .replace(/:GUEST:/g, guestName)
                .replace(/:CEREMONY_TIME:/g, ceremonyTime)
                .replace(/:VENUE_LOCATION:/g, venueLocation).replace(', ישראל', '')
                .replace(/:VENUE_LOCATION_URL:/g, venueLocationUrl);
        }

        $scope.messageGeneratorMap = {
            invite: function (guestName, brideAndGroom, eventDate, ceremonyTime, venue, venueLocation, venueLocationUrl) {
                return replacePlaceholders($scope.messageTypes.invite, guestName, brideAndGroom, eventDate, ceremonyTime, venue, venueLocation, venueLocationUrl);
            },
            approval: function (guestName, brideAndGroom, eventDate, ceremonyTime, venue, venueLocation, venueLocationUrl) {
                return replacePlaceholders($scope.messageTypes.approval, guestName, brideAndGroom, eventDate, ceremonyTime, venue, venueLocation, venueLocationUrl);

            },
            reminder: function (guestName, brideAndGroom, eventDate, ceremonyTime, venue, venueLocation, venueLocationUrl) {
                return replacePlaceholders(venueLocationUrl ? $scope.messageTypes.reminder : $scope.messageTypes.reminderNoUrl, guestName, brideAndGroom, eventDate, ceremonyTime, venue, venueLocation, venueLocationUrl);

            },
            thanks: function (guestName, brideAndGroom, eventDate, ceremonyTime, venue, venueLocation, venueLocationUrl) {
                return replacePlaceholders($scope.messageTypes.thanks, guestName, brideAndGroom, eventDate, ceremonyTime, venue, venueLocation, venueLocationUrl);
            },
            custom: function (guestName, brideAndGroom, eventDate, ceremonyTime, venue, venueLocation, venueLocationUrl) {
                return replacePlaceholders($scope.messageTypes.custom, guestName, brideAndGroom, eventDate, ceremonyTime, venue, venueLocation, venueLocationUrl);
            }
        };

        $scope.$watch('templateOrManual', function (newValue) {
            $scope.messageType = newValue == 'template' ? 'invite' : '';
        });

        $scope.storeData = function (key, value, $event) {
            if ($scope.guestListUrl) {
                if (key == 'guestListUrl') {
                    webStorage.set(key, value);
                }

                if (!$scope.promises[key]) {
                    $scope.promises[key] = $http.put('/field/' + encodeURIComponent(key) + '/' + encodeURIComponent(value || ''), {guestListUrl: $scope.guestListUrl}, {timeout: $scope.promises[key]})
                        .catch(function (err) {
                            if (err.status != -1 && err.status != 401) {
                                console.error(err);
                                alertConfirm.alert('שגיאה', 'שגיאה בשמירת עמודה!', $event);
                            }
                        })
                        .finally(function () {
                            delete $scope.promises[key];
                        });
                }
            }
        };

        $scope.updateGuestField = function (guest, fieldName, fieldValue, $event) {
            // Skip if it's a new guest and the field is not the phone number
            if ($scope.guestListUrl && !$scope.promises[fieldName] && (guest._id || fieldName == 'phoneNumber')) {
                $scope.promises[fieldName] = $http.put('/guest/' + (guest._id || 'new') + '/' + fieldName, {
                    guestListUrl: $scope.guestListUrl,
                    fieldValue: fieldValue
                }, {timeout: $scope.promises[fieldName]})
                    .success(function (data) {
                        if ($scope.newGuest) {
                            $scope.newGuest._id = data;
                            delete $scope.newGuest;

                            showToast('האורח החדש נשמר בהצלחה!');
                        }

                        guest[fieldName] = fieldValue;
                    })
                    .catch(function (err) {
                        if (err.status != -1 && err.status != 401) {
                            console.error(err);
                            alertConfirm.alert('שגיאה', err && err.data || 'שגיאה בשמירת נתוני אורח!', $event);
                        }
                    })
                    .finally(function () {
                        delete $scope.promises[fieldName];
                    });
            }
        };

        for (var messageType in $scope.messageTypes) {
            if ($scope.messageTypes.hasOwnProperty(messageType)) {
                var customMessageType = webStorage.get(messageType);

                if (customMessageType && customMessageType.length) {
                    $scope.messageTypes[messageType] = customMessageType;
                }
            }
        }

        $scope.formatDateTime = function (value, format) {
            return typeof value == 'string' ? value : moment(value).format(format);
        };

        function showToast(message) {
            $mdToast.show($mdToast.simple().content(message).position('bottom right').hideDelay(2000));
        }

        $scope.loadList = function ($event) {
            if (!$scope.guestListUrl) {
                alertConfirm.alert('שגיאה', 'לא הוזן קישור לרשימת מוזמנים!', $event);
            } else {
                $scope.sheet = null;
                $scope.promise = $http.post('/read-data/', {
                    guestListUrl: $scope.guestListUrl,
                    headerRow: $scope.headerRow,
                    authCode: $scope.authCode
                })
                    .then(function (result) {
                        angular.forEach(result.data.headers, function (header) {
                            header.isReadOnly = true;
                        });

                        $scope.guestListData = result.data;

                        [
                            'apiKey',
                            'apiSecret',
                            'smsSenderNumber',
                            'brideAndGroom',
                            'eventDate',
                            'eventTime',
                            'venue',
                            'venueLocation',
                            'venueLocationUrl',
                            'nameColumnIndex',
                            'guestCountColumnIndex',
                            'phoneNumberColumnIndex',
                            'messageSentColumnIndex',
                            'approvedGuestCountColumnIndex',
                            'messagesColumnIndex',
                            'giftColumnIndex'
                        ]
                            .forEach(function (key) {
                                $scope[key] = result.data.sheetData[key];
                            });

                        showToast('רשימת המוזמנים נטענה!');
                    })
                    .catch(function (err) {
                        if (err.status == 401) {
                            $scope.isShowCodeInput = true;
                            $window.open(err.data.authUrl, '_blank');
                        } else {
                            alertConfirm.alert('שגיאה', err && err.data || 'שגיאת שרת :(', $event);
                        }
                    })
                    .finally(function () {
                        $scope.promise = null;
                    });
            }
        };

        $scope.importData = function ($event) {
            if (!$scope.guestListUrl) {
                alertConfirm.alert('שגיאה', 'לא הוזן קישור לרשימת מוזמנים!', $event);
            } else {
                $scope.promise = $http.post('/import-data/', {
                    guestListUrl: $scope.guestListUrl,
                    authCode: $scope.authCode,
                    headerRow: $scope.headerRow,
                    nameColumnIndex: $scope.nameColumnIndex,
                    phoneNumberColumnIndex: $scope.phoneNumberColumnIndex,
                    guestCountColumnIndex: $scope.guestCountColumnIndex,
                    approvedGuestCountColumnIndex: $scope.approvedGuestCountColumnIndex
                })
                    .then(function (result) {
                        $scope.sheet = result.data;
                        $scope.guestListData = {
                            headers: [
                                {key: 'name', display: 'שם', type: 'text'},
                                {key: 'phoneNumber', display: 'טלפון', type: 'tel'},
                                {key: 'guestCount', display: 'מוזמנים', type: 'number'},
                                {key: 'sentMessageCount', display: 'הודעות שנשלחו לאורח', type: 'text', isReadOnly: true},
                                {key: 'approvedGuestCount', display: 'אורחים שמגיעים', type: 'number'},
                                {key: 'mealType', display: 'סוג ארוחה', options: 'בשרית צמחונית טבעונית'.split(' ')},
                                {key: 'gift.giftType', display: 'מתנה - סוג', options: 'מזומן המחאה פיזית'.split(' ')},
                                {key: 'gift.giftAmount', display: 'מתנה - סכום', type: 'number'},
                                {key: 'gift.currency', display: 'מתנה - מטבע', options: '₪ $ € אחר'.split(' ')},
                                {key: 'gift.isDeposited', display: 'מתנה - הופקד כסף?', isCheckBox: 'checkbox'},
                                {key: 'messages', display: 'הודעות', isCustom: true}
                            ],
                            rows: $scope.sheet.guests
                        };

                        showToast('הנתונים נטענו!');
                    })
                    .catch(function (err) {
                        if (err.status == 401) {
                            $scope.isShowCodeInput = true;
                            $window.open(err.data.authUrl, '_blank');
                        } else {
                            alertConfirm.alert('שגיאה', err && (err.data || err.message) || 'שגיאת שרת :(', $event);
                        }
                    })
                    .finally(function () {
                        $scope.promise = null;
                    });
            }
        };

        function sendSMS(guest, $event) {
            var messageGenerator = $scope.messageGeneratorMap[$scope.templateOrManual == 'template' ? $scope.messageType : 'custom'];
            var message = messageGenerator((guest.name || ' ').split(' ')[0], $scope.brideAndGroom, $scope.formatDateTime($scope.eventDate, 'dddd DD-MM-YY HH:mm'), $scope.eventTime, $scope.venue, $scope.venueLocation, $scope.venueLocationUrl);

            return $http.post('/send/' + guest.phoneNumber, {
                apiKey: $scope.apiKey,
                apiSecret: $scope.apiSecret,
                message: message,
                smsSenderNumber: $scope.smsSenderNumber,
                isOnlyToUnsentNumbers: $scope.isOnlyToUnsentNumbers,
                isOnlyToApprovedGuests: $scope.isOnlyToApprovedGuests,
                isOnlyToGuestsWithNoAnswer: $scope.isOnlyToGuestsWithNoAnswer,
                isOnlyToGuestsWhoBroughtGifts: $scope.isOnlyToGuestsWhoBroughtGifts
            })
                .success(function () {
                    guest.sentMessageCount = (guest.sentMessageCount || 0) + 1;
                    guest.messages.push({
                        messageId: Date.now(),
                        messageText: message,
                        messageDate: new Date().toISOString(),
                        direction: 'to-guest'
                    });
                })
                .error(function (err) {
                    console.error(err);
                    alertConfirm.alert('שגיאה', err && (err.data || err.message || err) || 'שגיאה בשליחת הודעה!', $event);
                });
        }

        $scope.sendAllSMS = function ($event) {
            alertConfirm.confirm('בטוח?', $event)
                .then(function (isSure) {
                    if (isSure) {
                        $scope.smsRequestsSent = 0;
                        $scope.smsResponsesGot = 0;

                        if (!$scope.phoneNumberColumnIndex) {
                            alertConfirm.alert('שגיאה', 'לא נבחרה עמודת טלפון!', $event);
                        } else {
                            angular.forEach($scope.guestListData.rows, function (guest) {
                                var sentMessages = guest.sentMessageCount || 0;
                                var approvedCount = guest.approvedGuestCount || 0;
                                var isReplied = guest.approvedGuestCount !== undefined;
                                var isGift = guest.gift !== undefined;

                                if (($scope.isOnlyToUnsentNumbers && sentMessages > 0) ||
                                    ($scope.isOnlyToApprovedGuests && approvedCount == 0) ||
                                    ($scope.isOnlyToGuestsWithNoAnswer && (!sentMessages || isReplied)) ||
                                    ($scope.isOnlyToGuestsWhoBroughtGifts && !isGift)) {
                                    console.log('skip');
                                } else {
                                    $scope.smsRequestsSent++;

                                    if (guest.phoneNumber) {
                                        $timeout(function () {
                                            sendSMS(guest, $event)
                                                .finally(function () {
                                                    $scope.smsResponsesGot++;
                                                });
                                        }, 1000);
                                    } else {
                                        $scope.smsResponsesGot++;
                                    }
                                }
                            });
                        }
                    }
                });
        };

        $scope.sendSingleSMS = function (guest, $event) {
            if (!$scope.phoneNumberColumnIndex) {
                alertConfirm.alert('שגיאה', 'לא נבחרה עמודת טלפון!', $event);
            } else if (guest && guest.phoneNumber) {
                $scope.singleSmsPromise = sendSMS(guest, $event)
                    .finally(function () {
                        $scope.singleSmsPromise = null;
                    });
            }
        };

        $scope.showMessages = function (guest, $event) {
            $mdDialog.show({
                template: '<md-dialog class="messages" aria-label="הודעות">' +
                '<md-toolbar>' +
                '  <div class="md-toolbar-tools">' +
                '    <h3>הודעות</h3>' +
                '    <span data-flex></span>' +
                '  </div>' +
                '</md-toolbar>' +
                '<md-dialog-content layout-padding layout="column">' +
                '  <md-content layout-padding>' +
                '       <md-card ng-repeat="message in guest.messages | orderBy:\'messageDate\'" class="message" ng-class="message.direction">' +
                '           <span class="message-title">{{message.direction == \'from-guest\' ? guest.name : \'מערכת\'}}</span>' +
                '           <span class="message-text" ng-bind-html="message.messageHtml"></span>' +
                '           <span class="message-date">{{message.messageDate | date: \'dd/MM/yy hh:mm:ss\'}}</span>' +
                '       </md-card>' +
                '  </md-content>' +
                '</md-dialog-content>' +
                '<md-dialog-actions>' +
                '  <md-button ng-click="cancel()" class="md-primary md-raised">סגור</md-button>' +
                '</md-dialog-actions>' +
                '</md-dialog>',
                targetEvent: $event,
                controller: function ($mdDialog, $scope) {
                    $scope.guest = angular.copy(guest);
                    angular.forEach($scope.guest.messages, function (message) {
                        message.messageHtml = $sce.trustAsHtml(message.messageText);
                    });

                    $scope.cancel = $mdDialog.cancel;
                }
            });
        };

        $scope.getTotalGuestCount = function () {
            var totalGuests = 0;

            if ($scope.guestListData) {
                angular.forEach($scope.guestListData.rows, function (row) {
                    totalGuests += Number(row.guestCount || row[$scope.guestCountColumnIndex] || 0);
                });
            }

            return totalGuests;
        };

        $scope.getTotalApprovedCount = function () {
            var totalApproved = 0;

            if ($scope.guestListData) {
                angular.forEach($scope.guestListData.rows, function (row) {
                    totalApproved += Number(row.approvedGuestCount || row[$scope.approvedGuestCountColumnIndex] || 0);
                });
            }

            return totalApproved;
        };

        $scope.getTotalMealTypes = function (mealType) {
            var totalOfMealType = 0;

            if ($scope.guestListData) {
                angular.forEach($scope.guestListData.rows, function (row) {
                    totalOfMealType += row.mealType == mealType ? 1 : 0;
                });
            }

            return totalOfMealType;
        };

        $scope.limitOptions = [5, 10, 15];

        $scope.options = {
            rowSelection: true,
            multiSelect: true,
            autoSelect: true,
            decapitate: false,
            largeEditDialog: false,
            boundaryLinks: false,
            limitSelect: true,
            pageSelect: true
        };

        $scope.query = {
            order: 0,
            limit: 5,
            page: 1
        };

        $scope.formatField = function (value, field) {
            if (value) {
                if (field == $scope.phoneNumberColumnIndex) {
                    value = value
                        .replace(/^0/, '')
                        .replace('-', '')
                        .replace('+', '')
                        .replace(/\s+/g, '')
                        .replace('^972', '');
                } else if (field == $scope.messagesColumnIndex) {
                    value = value.replace(/[\n]/g, '<br />');
                }
            }

            return value;
        };

        $scope.showMore = function (isShowAll) {
            $scope.rowsToShow += isShowAll ? $scope.guestListData.rows.length : $scope.rowsPage;
        };

        $scope.addGuest = function () {
            $scope.newGuest = {
                phoneNumber: '0000000000'
            };
            $scope.guestListData.rows.push($scope.newGuest);
            $scope.rowsToShow++;
        };

        $scope.disableGuest = function (guest, $index, $event) {
            if (guest._id) {
                $scope.updateGuestField(guest, 'isDisabled', !guest.isDisabled, $event);
            } else {
                $scope.guestListData.rows.splice($index, 1);
                $scope.rowsToShow--;
                delete $scope.newGuest;
            }
        };

        $scope.getCsvRows = function (rows) {
            return rows.map(function (row) {
                return {
                    name: row.name,
                    phoneNumber: row.phoneNumber,
                    guestCount: row.guestCount,
                    sentMessageCount: row.sentMessageCount,
                    approvedGuestCount: row.approvedGuestCount,
                    mealType: row.mealType,
                    'gift.giftType': row['gift.giftType'],
                    'gift.giftAmount': row['gift.giftAmount'],
                    'gift.currency': row['gift.currency'],
                    'gift.isDeposited': row['gift.isDeposited'] ? 'כן' : 'לא'
                }
            });
        };

        $scope.getCsvHeaders = function (headers) {
            return headers.map(function (header) {
                if (header.key != 'messages') {
                    return header.display;
                }
            });
        };
    }]);