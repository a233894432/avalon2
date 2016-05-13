
var vm = avalon.define({
    $id: "DBMonCtrl",
    databases: []

})
window.onload = function(){
    avalon.scan(document.body, vm)
    load();
}
var load = function () {
    
  //  console.log( ENV.generateData().toArray())
   
    vm.databases = ENV.generateData().toArray();
    Monitoring.renderRate.ping();
    setInterval(load,50);
};

