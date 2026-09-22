document.addEventListener('DOMContentLoaded', function() {
    fetch('/api/health')
        .then(function(res) { return res.json(); })
        .then(function(data) {
            console.log('Study Assistant health:', data);
        })
        .catch(function() {
            console.log('Health check unavailable');
        });
});
