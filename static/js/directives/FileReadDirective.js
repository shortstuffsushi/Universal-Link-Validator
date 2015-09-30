var module = angular.module('FileReadDirective', [ ]);

module.directive('fileread', function() {
    return {
        scope: {
            fileread: '=',
            appnameset: '='
        },
        link: function(scope, element, attributes) {
            element.bind('change', function (changeEvent) {
                scope.$apply(function () {
                    var file = changeEvent.target.files[0];
                    scope.fileread = file;
                    scope.appnameset = file.name.substring(0, file.name.lastIndexOf('.'));
                });
            });
        }
    }
});
