angular.module('alertConfirm', ['ngMaterial'])
    .service('alertConfirm', ['$rootScope', '$mdDialog', function ($rootScope, $mdDialog) {
        this.alert = function (title, message, $event) {
            var alert = $mdDialog.alert({
                title: title,
                textContent: message,
                ok: 'אוקיי'
            });

            if ($event) {
                alert.targetEvent($event);
            }

            return $mdDialog.show(alert);
        };

        this.confirm = function (message, $event) {
            var confirm = $mdDialog.confirm({
                title: message,
                ok: 'כן',
                cancel: 'לא'
            });

            if ($event) {
                confirm.targetEvent($event);
            }

            return $mdDialog.show(confirm);
        };
    }]);