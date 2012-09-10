dojo.provide("myModules.TimeSliderGeoiqExt");
dojo.require("dijit._Widget");
dojo.require("dijit._Templated");
dojo.require("dojox.form.RangeSlider");
dojo.require("dijit.form.HorizontalRuleLabels");
dojo.require("dijit.form.HorizontalRule");
dojo.require("dojox.timing._base");

/***************
 * CSS Includes
 ***************/
//anonymous function to load CSS files required for this module
(function() {
  var css = [dojo.moduleUrl("dojox", "form/resources/RangeSlider.css"), dojo.moduleUrl("esri.dijit", "css/TimeSlider.css")];
  
  var head = document.getElementsByTagName("head").item(0), link;
  for (var i = 0, il = css.length; i < il; i++) {
    link = document.createElement("link");
    link.type = "text/css";
    link.rel = "stylesheet";
    link.href = css[i];
    head.appendChild(link);
  }
})();

/************************
 * Attachment Editor Dijit
 ************************/
dojo.declare("myModules.TimeSliderGeoiqExt", [dijit._Widget, dijit._Templated], {

  widgetsInTemplate: true,
  templatePath: dojo.moduleUrl(location.pathname.replace(/\/[^/]+$/, "") + "/dijit", "templates/GeoIQTimeSlider.html"),
  basePath: dojo.moduleUrl("dijit"),
  
  _slideDuration: 1000,
  _defaultCount: 10,
  
  /*************
   * Overrides
   *************/
  constructor: function(params, srcNodeRef) {
    // Mixin i18n strings
    dojo.mixin(this, esri.bundle.widgets.timeSlider);
    
    this._iconClass = "tsButton tsPlayButton";
    this.playing = false;
    this.loop = false;
    this.thumbCount = 1;
    this.thumbMovingRate = 1000;
    this._createTimeInstants = false;
    this._options = dojo.mixin({excludeDataAtTrailingThumb: false, excludeDataAtLeadingThumb: false}, params.options || {});
  },
  
  startup: function() {
    this.inherited(arguments);
    
    this._timer = new dojox.timing.Timer();
    this._timer.setInterval(this.thumbMovingRate);
    this._timer.onTick = dojo.hitch(this, "_bumpSlider", 1);
    this._createSlider();  
  },
  
  // pre-set options for this widget
  options : {
    showingOverview : true,
    maxOverviewBins : 500,
    maxFocusBins : 500,
    stepPercentage : .015,
    playInterval : 300,
    allowOverview : true,
    playMode : "range"
  },
  
  // years, months, days, hours, minutes
  _resolutions: {
    "second"  : 1000,
    "minute"  : 1000*60,
    "hour"    : 1000*60*60,
    "day"     : 1000*60*60*24,
    "month"   : 1000*60*60*24*30,
    "year"    : 1000*60*60*24*365
  },
  
  initSlider: function() {
    this.inherited(arguments);
    console.log('is here now')
    this._isPlaying = false;
    this._isDragging = false;
    //this._playMode = this.options.playMode;
    this._bins = {};
    this._maxCounts = {};
    
    this._resolutionDirty = true;
    this._timespanDirty = true;
    
    // crete the widget content
    //this._finishUI();
    //this._wire();
    this._initCharts();
    this.loaded = false;
    
    //will need to move
    this.overviewTimespan = {};
    this._onTemporalReady();
  },
  
  destroy: function() {
    this._timer.stop();
    this._timer = null;
    this.timeStops = null;
    this._slider.destroy();
    this._slider = null;
    
    if (this._hTicks) {
      this._hTicks.destroyRecursive();
      this._hTicks = null;
    }
    
    if (this._hLabels) {
      this._hLabels.destroyRecursive();
      this._hLabels = null;
    }
    
    this.inherited(arguments);
  },
  
  _onTemporalReady: function( ) {
    var bins = timeSlider.bins;
    var res = 'day';
    this.overviewResolution = res;
    
    this.overviewTimespan.min = bins[0].utc;
    this.overviewTimespan.max = bins[bins.length-1].utc;
    console.log('timspane', this.overviewTimespan)
    
    this._addBins(bins, res);
    this._drawOverview();
  },
  
  /****************
   * init charts
   **************/
  
  _initCharts : function(reload)
    {
      this.overviewAnnotationCanvas = Raphael("overviewAnnotation", dojo.byId( "overviewAnnotation" ).offsetWidth, dojo.byId( "overviewAnnotation" ).offsetHeight );
      this.overviewCanvas = Raphael("overview", dojo.byId("overview").offsetWidth, dojo.byId("overview").offsetHeight);
      
      this.overviewBars = this.overviewCanvas.set();
      this.highlightBars = this.overviewCanvas.set();
      
      this.obscuringCanvas = Raphael("overviewBlockers", dojo.byId("overviewBlockers").offsetWidth, dojo.byId("overviewBlockers").offsetHeight);
      
      this.obscuringBars = this.obscuringCanvas.set();
      
      this.obscuringBars.push( this.obscuringCanvas.rect(-1,0,10,dojo.byId("overview").offsetHeight), this.obscuringCanvas.rect(300,0,10,dojo.byId("overview").offsetHeight) );
      this.obscuringBars.push( this.obscuringCanvas.rect( 0, dojo.byId( "overview" ).offsetHeight - 1, 10, 10 ) );
      
      this.obscuringBars.attr( { fill: "#444", 'fill-opacity' : .1, stroke : "#666" } );
      
      this.focusAnnotationCanvas = Raphael( "focusAnnotation", dojo.byId( "focusAnnotation" ).offsetWidth, dojo.byId( "focusAnnotation" ).offsetHeight );
     
      this.focusCanvas = Raphael("focus", dojo.byId( "focus" ).offsetWidth, dojo.byId( "focus" ).offsetHeight);
      if (!reload) {
        this.focusBarSets = {};
      }
    },
    
    _addBins : function( bins, resolution )
      {       
        var processedBins = [];
        var ms = this._resolutions[ resolution ];
        var minTime = timeSlider.fullTimeExtent.startTime;
        var max = -999;
        var ind = 0;
        // figure max
        for(var i=0;i<bins.length;i++)
        {
          if ( bins[i].count > max )
          {
            max = bins[i].count;
          }
          bins[i].utc = bins[i].timestamp.getTime();
          
          ind = Math.round( ( bins[i].utc - minTime ) / ms );
          
          processedBins.push(bins[i]);
        };

        this._bins[resolution] = processedBins;
        this._maxCounts[resolution] = max;
      },
      
    /**
     * draws the overview histogram
     */
    _drawOverview : function(fill)
    { 
      //not supporting multiple resolutions right now
      var bins = this._bins[this.overviewResolution];
                              
      var overviewRange = this.overviewTimespan.max - this.overviewTimespan.min;
      // need to know the max count
      var maxCount = this._maxCounts[this.overviewResolution];
      
      // bucket size in ms
      var bucket_size = this._resolutions[ this.overviewResolution ];
      var num_buckets = Math.ceil(overviewRange / bucket_size);
      
      var bucket_width = (bucket_size * this.overviewCanvas.width) / overviewRange;
      var gap = bucket_width / 5;
      var bin, x, y, h;
      
      for ( var i = 0; i < bins.length; i++ )
      {
        bin = bins[i];
        console.log('bin', bin)
        if ( !bin ) continue;
      
        x = ( bin.timestamp.getTime() - this.overviewTimespan.min ) / overviewRange * this.overviewCanvas.width;
        console.log('x: ', x)
        h = ( this.overviewCanvas.height - 5 ) * bin.count / maxCount;
        y = this.overviewCanvas.height - h;
        var bar = this.overviewCanvas.rect( x, y, bucket_width - gap, h ); // .attr({fill: "#ddd", 'stroke': 'none'});
        this.overviewBars.push( bar );
        bar.mouseover( function( event )
        {
          this.attr({fill : "#fefe00"});
        });
        bar.mouseout( function( event )
        {
          this.attr({fill : "#DDD"});
        });
        
        bar = this.overviewCanvas.rect( x, y, bucket_width - gap, h ); // .attr({fill: "#ddd", 'stroke': 'none'});
        this.highlightBars.push( bar );
        
        bar.mouseover( function( event )
        {
          this.attr({fill : "#fefe00"});
        });
        bar.mouseout( function( event )
        {
          this.attr({fill : "#084594"});
        });
        
      }
      this.overviewBars.attr({fill: "#ddd", 'stroke': 'none'});
      this.highlightBars.attr({fill: "#084594", 'stroke': 'none' });
      this.highlightBars.attr( { 'clip-rect' : '600,0,100,100' } );
    },
  
  /*****************
   * Events
   *****************/
  onTimeExtentChange: function() {},
  onPlay: function() {},
  onPause: function() {},
  onNext: function() {},
  onPrevious: function() {},
  
  /*****************
   * Event Listeners
   *****************/
  _onHorizontalChange: function() {
    var timeExtent = this._sliderToTimeExtent();
    this.onTimeExtentChange(timeExtent);
    //console.log("StartTime: " + timeExtent.startTime);
    //console.log("EndTime: " + timeExtent.endTime);
  },
  
  _onPlay: function() {
    this.playing = !this.playing;
    this._updateUI();
    if (this.playing) {
      this._timer.start();
      this.onPlay(this._sliderToTimeExtent());
    } else {
      this._timer.stop();
      this.onPause(this._sliderToTimeExtent());
    }
    var val = this._getSliderValue();
    this._offset = dojo.isArray(val) ? (val[1] - val[0]) : 0;
  },
  
  _onNext: function() {
    if (!this.playing) {
      this._bumpSlider(1);
      this.onNext(this._sliderToTimeExtent());
    }
  },
  
  _onPrev: function() {
    if (!this.playing) {
      this._bumpSlider(-1);
      this.onPrevious(this._sliderToTimeExtent());
    }
  },
  
  /*****************
   * Public Methods
   *****************/
  createTimeStopsByCount: function(timeExtent, count) {
    if (!timeExtent || !timeExtent.startTime || !timeExtent.endTime) {
      console.log(this.NLS_invalidTimeExtent);
      return;
    }
    
    count = count || this._defaultCount;
    //Use count-1, disregard start time
    var offset = Math.ceil((timeExtent.endTime - timeExtent.startTime) / (count - 1));
    this.createTimeStopsByTimeInterval(timeExtent, offset, 'esriTimeUnitsMilliseconds');
  },
  
  createTimeStopsByTimeInterval: function(timeExtent, timeInterval, timeIntervalUnits, options) {
    if (!timeExtent || !timeExtent.startTime || !timeExtent.endTime) {
      console.log(this.NLS_invalidTimeExtent);
      return;
    }
    
    this.fullTimeExtent = new esri.TimeExtent(timeExtent.startTime, timeExtent.endTime);
    if (options && options.resetStartTime === true) {
      this._resetStartTime(this.fullTimeExtent, timeIntervalUnits);
    }
    
    this._timeIntervalUnits = timeIntervalUnits;
    var te = this.fullTimeExtent.startTime;
    var timeStops = [];
    while (te <= timeExtent.endTime) {
      timeStops.push(te);
      te = timeExtent._getOffsettedDate(te, timeInterval, timeIntervalUnits);
    }
    
    if (timeStops.length > 0 && timeStops[timeStops.length - 1] < timeExtent.endTime) {
      timeStops.push(te);
    }
    
    this.setTimeStops(timeStops);
  },
  
  getCurrentTimeExtent: function() {
    return this._sliderToTimeExtent();
  },
  
  setTimeStops: function(timeStops) {
    this.timeStops = timeStops || [];
    this._numStops = this.timeStops.length;
    this._numTicks = this._numStops;
    if (esri._isDefined(this.fullTimeExtent) === false){
        this.fullTimeExtent = new esri.TimeExtent(timeStops[0], timeStops[timeStops.length - 1]);
    }
  },
  
  setLoop: function(loop) {
    this.loop = loop;
  },
  
  setThumbCount: function(thumbCount) {
    this.thumbCount = thumbCount;
    this.singleThumbAsTimeInstant(this._createTimeInstants);
    if (this._slider) {
      this._createSlider();
    }
  },
  
  setThumbIndexes: function(indexes) {
    this.thumbIndexes = dojo.clone(indexes) || [0, 1];
    this._initializeThumbs();
  },
  
  setThumbMovingRate: function(thumbMovingRate) {
    this.thumbMovingRate = thumbMovingRate;
    if (this._timer) {
      this._timer.setInterval(this.thumbMovingRate);
    }
  },
  
  setLabels: function(labels) {
    this.labels = labels;
    if (this._slider) {
      this._createSlider();
    }
  },
  
  setTickCount: function(ticks) {
    this._numTicks = ticks;
    if (this._slider) {
      this._createSlider();
    }
  },
  
  singleThumbAsTimeInstant: function(createTimeInstants) {
    this._createTimeInstants = (createTimeInstants && this.thumbCount === 1);
  },
  
  next: function() {
    this._onNext();
  },
  
  pause: function() {
    this.playing = false;
    this._updateUI();
    this._timer.stop();
  },
  
  play: function() {
    if (this.playing === true) {
      return;
    }
    
    this.playing = false;
    this._onPlay();
  },
  
  previous: function() {
    this._onPrev();
  },
  
  /*******************
   * Internal Methods
   *******************/
  _updateUI: function() {
    dojo.removeClass(this.playPauseBtn.iconNode, this._iconClass);
    this._iconClass = this.playing ? "tsButton tsPauseButton" : "tsButton tsPlayButton";
    dojo.addClass(this.playPauseBtn.iconNode, this._iconClass);
    this.previousBtn.set('disabled', this.playing);
    this.nextBtn.set('disabled', this.playing);
  },
  
  _createSlider: function() {
    if (this._slider) {
      this._slider.destroy();
      this._slider = null;
    }
    
    // To detect the 'rtl' or 'ltr' direction
    // to create the control, seems there are
    // bugs in dojo related to this
    //
    // http://trac.dojotoolkit.org/ticket/9160
    //
    var node = this.domNode;
    while (node.parentNode && !node.dir){
      node = node.parentNode;
    }
    
    var sliderOptions = {
      onChange: dojo.hitch(this, "_onHorizontalChange"),
      showButtons: false,
      discreteValues: this._numStops,
      slideDuration: this._slideDuration,
      'class': "ts",
      id: "ts",
      dir: node.dir
    };
    
    var ts = dojo.create("div", {
      id: "ts"
    }, dojo.byId("overviewSlider"), "first");
    dojo.create("div", {
      id: "timeSliderTicks"
    }, ts, "first");
    dojo.create("div", {
      id: "timeSliderLabels"
    }, ts);
    
    if (this.thumbCount === 2) {
      this._createRangeSlider(sliderOptions);
    } else {
      this._createSingleSlider(sliderOptions);
    }
    
    this.thumbIndexes = this.thumbIndexes || [0, 1];
    this._createHorizRule();
    this._createLabels();
    
    if (this._createTimeInstants === true) {
      dojo.query(".dijitSliderProgressBarH, .dijitSliderLeftBumper, .dijitSliderRightBumper").forEach("dojo.style(item, { background: 'none' });");
    }
    
    this._initializeThumbs();
    
    dojo.disconnect(this._onChangeConnect);
    this._onChangeConnect = dojo.connect(this._slider, "onChange", dojo.hitch(this, "_updateThumbIndexes"));
  },
  
  _createRangeSlider: function(options) {
    this._isRangeSlider = true;
    this._slider = new dojox.form.HorizontalRangeSlider(options, dojo.byId('ts'));
  },
  
  _createSingleSlider: function(options) {
    this._isRangeSlider = false;
    this._slider = new dijit.form.HorizontalSlider(options, dojo.byId('ts'));
  },
  
  _createHorizRule: function() {
    if (this._hTicks) {
      this._hTicks.destroyRecursive();
      this._hTicks = null;
    }
    
    if (this._numTicks < 2){
      return;
    }
    
    this._hTicks = new dijit.form.HorizontalRule({
      container: "topDecoration",
      ruleStyle: "",
      'class': "tsTicks",
      count: this._numTicks,
      id: "tsTicks"
    }, dojo.byId('timeSliderTicks'));
  },
  
  _createLabels: function() {
    if (this._hLabels) {
      this._hLabels.destroyRecursive();
      this._hLabels = null;
    }
    
    if (this.labels && this.labels.length > 0) {
      this._hLabels = new dijit.form.HorizontalRuleLabels({
        labels: this.labels,
        labelStyle: "",
        'class': "tsLabels",
        id: "tsLabels"
      }, dojo.byId("timeSliderLabels"));
    }
  },
  
  _initializeThumbs: function() {
    if (!this._slider) {
      return;
    }
    
    this._offset = this._toSliderValue(this.thumbIndexes[1]) || 0;
    var t1 = this._toSliderValue(this.thumbIndexes[0]);
    t1 = (t1 > this._slider.maximum || t1 < this._slider.minimum) ? this._slider.minimum : t1;
    if (this._isRangeSlider === true) {
      var t2 = this._toSliderValue(this.thumbIndexes[1]);
      t2 = (t2 > this._slider.maximum || t2 < this._slider.minimum) ? this._slider.maximum : t2;
      t2 = t2 < t1 ? t1 : t2;
      this._setSliderValue([t1, t2]);
    } else {
      this._setSliderValue(t1);
    }
    this._onHorizontalChange();
  },
  
  _bumpSlider: function(dir) {
    var val = this._getSliderValue();
    var max = val, min = max;
    var bumpVal = dir;
    if (dojo.isArray(val)) {
      min = val[0];
      max = val[1];
      bumpVal = [{
        'change': dir,
        'useMaxValue': true
      }, {
        'change': dir,
        'useMaxValue': false
      }];
      
    }
    // deal with rounding issues
    if ((Math.abs(min-this._slider.minimum) < 1E-10 && dir < 0) || (Math.abs(max-this._slider.maximum) < 1E-10 && dir > 0)) {
      if (this._timer.isRunning) {
        if (this.loop) {
          this._timer.stop();
          this._setSliderValue(this._getSliderMinValue());
          var timeExtent = this._sliderToTimeExtent();
          this.onTimeExtentChange(timeExtent);
          this._timer.start();
          this.playing = true;
        } else {
          this.pause();
        }
      }
    } else {
      this._slider._bumpValue(bumpVal);
    }            
  },
  
  _updateThumbIndexes: function(){    
    var val = this._getSliderValue();
    if (dojo.isArray(val)) {
      this.thumbIndexes[0] = this._toSliderIndex(val[0]);
      this.thumbIndexes[1] = this._toSliderIndex(val[1]);
    } else {
      this.thumbIndexes[0] = this._toSliderIndex(val);    
    }
  },
  
  _sliderToTimeExtent: function() {
    if (!this.timeStops || this.timeStops.length === 0) {
      return;
    }
    
    var retVal = new esri.TimeExtent();
    var val = this._getSliderValue();
    if (dojo.isArray(val)) {
      retVal.startTime = new Date(this.timeStops[this._toSliderIndex(val[0])]);
      retVal.endTime = new Date(this.timeStops[this._toSliderIndex(val[1])]);
      this._adjustTimeExtent(retVal);
    } else {
      retVal.startTime = (this._createTimeInstants === true) ? new Date(this.timeStops[this._toSliderIndex(val)]) : new Date(this.fullTimeExtent.startTime);
      retVal.endTime = (this._createTimeInstants === true) ? retVal.startTime : new Date(this.timeStops[this._toSliderIndex(val)]);
    }
    
    return retVal;
  },
  
  _binData: function() {
    if (!this.timeStops || this.timeStops.length === 0) {
      return;
    }
    console.log('timeSlider.countPerBin', timeSlider.bins)
  },
  
  _adjustTimeExtent: function(timeExtent) {
    if (this._options.excludeDataAtTrailingThumb === false &&
    this._options.excludeDataAtLeadingThumb === false) {
      return;
    }
    
    if (timeExtent.startTime.getTime() === timeExtent.endTime.getTime()) {
      return;
    }
    
    if (this._options.excludeDataAtTrailingThumb) {
      var startTime = timeExtent.startTime;
      startTime.setUTCSeconds(startTime.getUTCSeconds() + 1);
    }
    
    if (this._options.excludeDataAtLeadingThumb) {
      var endTime = timeExtent.endTime;
      endTime.setUTCSeconds(endTime.getUTCSeconds() - 1);
    }
  },
  
  _resetStartTime: function(timeExtent, timeIntervalUnits) {
    switch (timeIntervalUnits) {
      case 'esriTimeUnitsSeconds':
        timeExtent.startTime.setUTCMilliseconds(0);
        break;
      case 'esriTimeUnitsMinutes':
        timeExtent.startTime.setUTCSeconds(0, 0, 0);
        break;
      case 'esriTimeUnitsHours':
        timeExtent.startTime.setUTCMinutes(0, 0, 0);
        break;
      case 'esriTimeUnitsDays':
        timeExtent.startTime.setUTCHours(0, 0, 0, 0);
        break;
      case 'esriTimeUnitsWeeks':
        timeExtent.startTime.setUTCDate(timeExtent.startTime.getUTCDate() - timeExtent.startTime.getUTCDay());
        break;
      case 'esriTimeUnitsMonths':
        timeExtent.startTime.setUTCDate(1);
        timeExtent.startTime.setUTCHours(0, 0, 0, 0);
        break;
      case 'esriTimeUnitsDecades':
        timeExtent.startTime.setUTCFullYear(timeExtent.startTime.getUTCFullYear() - (timeExtent.startTime.getUTCFullYear() % 10));
        break;
      case 'esriTimeUnitsCenturies':
        timeExtent.startTime.setUTCFullYear(timeExtent.startTime.getUTCFullYear() - (timeExtent.startTime.getUTCFullYear() % 100));
        break;
    }
  },
  
  _getSliderMinValue: function() {
    if (this._isRangeSlider) {
      return [this._slider.minimum, this._slider.minimum + this._offset];
    } else {
      return this._slider.minimum;
    }
  },
  
  _toSliderIndex: function(val) {
    var idx = Math.floor((val - this._slider.minimum) * this._numStops / (this._slider.maximum - this._slider.minimum));
    if (idx < 0) {
      idx = 0;
    }
    if (idx >= this._numStops) {
      idx = this._numStops - 1;
    }
    return idx;
  },
  
  _toSliderValue: function(val) {
    return val * (this._slider.maximum - this._slider.minimum) / (this._numStops - 1) + this._slider.minimum;
  },
  
  _getSliderValue: function() {
    return this._slider.get('value');
  },
  
  _setSliderValue: function(val) {
    this._slider._setValueAttr(val, false, false);
  }
});
