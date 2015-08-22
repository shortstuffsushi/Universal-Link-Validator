var module = angular.module('FileReadDirective', [ ]);

module.directive('fileread', function() {
    return {
        scope: {
            fileread: '='
        },
        link: function(scope, element, attributes) {
            element.bind('change', function (changeEvent) {
                scope.$apply(function () {
                    scope.fileread = changeEvent.target.files[0];
                });
            });
        }
    }
});
