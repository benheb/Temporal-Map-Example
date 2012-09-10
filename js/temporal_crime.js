      dojo.require("esri.map");
      dojo.require("dojo.io.script");
      //dojo.require("esri.dijit.TimeSlider");
      dojo.require("myModules.TimeSliderGeoiqExt");


      var timeSlider; 
      
      function init() {
        var startExtent = new esri.geometry.Extent({"xmin":-8381753.575299095,"ymin":4864602.340301298,"xmax":-8342635.093809094,"ymax":4896425.59837099,"spatialReference":{"wkid":102100}});
        var map = new esri.Map("map", {extent:startExtent});
        
        var layers = [];
        var basemap = new esri.layers.ArcGISTiledMapServiceLayer("http://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer");
        layers.push(basemap);

        var crimeLayer= new esri.layers.ArcGISDynamicMapServiceLayer("http://ec2-23-22-185-186.compute-1.amazonaws.com:6080/arcgis/rest/services/PhillyCrime/MapServer");
        crimeLayer.setVisibleLayers([0]);
        console.log('opLayer', crimeLayer)
        
        layers.push(crimeLayer);

        //add all the layers to the map then initialize the slider
        map.addLayers(layers);
        dojo.connect(map,"onLayersAddResult",initSlider);
        
        //total count for mapservicelayer
         var targetNode = dojo.byId("totalcount");
         var getTotalCount = {
           url: "http://ec2-23-22-185-186.compute-1.amazonaws.com:6080/arcgis/rest/services/PhillyCrime/MapServer/0/query?where=1=1&returnCountOnly=true&f=json",
           callbackParamName: "callback",
           content: {
             v: "1.0",
             q: "dojo toolkit"
           },
           load: function(data){
             targetNode.innerHTML = "<pre>" + data['count'] + "</pre>";
           }
         };
         dojo.io.script.get(getTotalCount);
      }

      function initSlider(results) {
        var map = this;
        timeSlider = new myModules.TimeSliderGeoiqExt({style: "width: 760px;"},dojo.byId("timeSliderDiv"));
        map.setTimeSlider(timeSlider);
        
        var timeExtent = new esri.TimeExtent();
        timeExtent.startTime = new Date("2002/06/01 00:04:00 UTC");
        timeExtent.endTime = new Date("2002/06/29 23:59:00 UTC");
        timeSlider.setThumbCount(2);
        timeSlider.createTimeStopsByTimeInterval(timeExtent,7,'esriTimeUnitsDays');
        timeSlider.setThumbIndexes([0,1]);
        timeSlider.setThumbMovingRate(2000);
        timeSlider.numberBins = timeSlider.timeStops.length-1;
        timeSlider.bins = [];
        timeSlider.startup();
        
        //total bins: 
        dojo.byId("totalbins").innerHTML = timeSlider.timeStops.length-1;

        for(var i=0;i<timeSlider.timeStops.length-1;i++) {
          var loadCnt = 0,
            time0 = timeSlider.timeStops[i],
            time0 = new Date(time0).getTime(),
            time1 = timeSlider.timeStops[i+1],
            time1 = new Date(time1).getTime()

          //get counts for each BIN
          var targetNode = dojo.byId("binonecount");
           var getCounts = {
             url: "http://ec2-23-22-185-186.compute-1.amazonaws.com:6080/arcgis/rest/services/PhillyCrime/MapServer/0/query?where=1=1&time="+time0+","+time1+"&returnCountOnly=true&f=json",
             callbackParamName: "callback",
             content: {
               v: "1.0",
               q: "dojo toolkit"
             },
             load: function(data){
               loadCnt++;
               
               var timestamp = timeSlider.timeStops[loadCnt];
               var utc = new Date(timestamp).getTime();
               
               timeSlider.bins.push({"count": data['count'], "timestamp": timestamp, 'utc': utc});
               
               //pass array of counts to slider when finished
               if (loadCnt==timeSlider.timeStops.length-1) {timeSlider.initSlider()};
               dojo.create("span", { innerHTML: data['count'] + ","}, targetNode, "before");
             },
             error: function(error){
               targetNode.innerHTML = "An unexpected error occurred: " + error;
             }
           };
           dojo.io.script.get(getCounts);
           
        }
        
        //add labels for every other time stop
        var labels = dojo.map(timeSlider.timeStops, function(timeStop,i){ 
          if(i%2 === 0){
            return timeStop.getUTCFullYear(); }
          else{
            return "";
          }
        });      
        
        timeSlider.setLabels(labels);
        
        dojo.connect(timeSlider, "onTimeExtentChange", function(timeExtent) {
          var startValString = timeExtent.startTime.getUTCFullYear();
          var endValString = timeExtent.endTime.getUTCFullYear();
          dojo.byId("daterange").innerHTML = "<i>" + startValString + " and " + endValString  + "<\/i>";
        });
      }
      
      function updateSlider() {
          dojo.connect(timeSlider, "onTimeExtentChange", function(timeExtent) {
          console.log('timeExtent', timeExtent);
        });
          
       }
      
      dojo.addOnLoad(init);