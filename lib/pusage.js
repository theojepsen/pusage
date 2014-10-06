var fs = require('fs');
var os = require('os');
var util = require('util');
var events = require('events');
var spawn = require('child_process').spawn;
var async = require('async');

var numCpus = os.cpus().length;

var reProcVmSize = /.*VmSize:\s+([0-9]+)\s/;
var reProcVmRSS = /.*VmRSS:\s+([0-9]+)\s/;
var rePname = /.*\((.*)\).*/;

function getPidOf(pname, cb) {
  var pidof = spawn('pidof', [pname]);
  var buf = '';
  pidof.stdout.on('data', function (d) {
    buf += d;
  });
  pidof.on('close', function (code) {
    if (code !== 0) return cb({code: code});
    cb(null, buf.trim().split(' ').map(parseInt));
  });
}

function parseTotalTime(str) {
  return str.toString().split('\n')[0].split('cpu')[1].trim().split(' ').reduce(function (p, t) {
    return p + parseInt(t, 10);
  }, 0);
}

function parseProcStat(str, dst) {
  var parts = str.toString().split(')')[1].trim().split(' ');
  dst.utime = parseInt(parts[11], 10);
  dst.stime = parseInt(parts[12], 10);
  dst.num_threads = parseInt(parts[17], 10);
}

function parseProcStatus(str, dst) {
  str = str.toString();
  dst.VmSize = parseInt(reProcVmSize.exec(str)[1], 10);
  dst.VmRSS = parseInt(reProcVmRSS.exec(str)[1], 10);
}

function parseIoInfo(str, dst) {
  var parts;
  str.toString().split('\n').forEach(function (l) {
    parts = l.split(': ');
    dst[parts[0]] = parseInt(parts[1], 10);
  });
}


function PUsage (opts) {
  events.EventEmitter.call(this);
  var self = this;

  if (opts && typeof opts !== 'object')
    throw new TypeError('PUsage(): invalid arguments: expected an options hash (object)');
  opts = opts || {};

  // Some settings:
  self.interval = opts.interval || 500;
  self.logStream = opts.logStream || null;
  if (opts.logFile && typeof opts.logFile === 'string')
    self.logStream = fs.createWriteStream(opts.logFile);

  // State that is not configurable:
  self.running = false;
  self.startTime = 0;

  self.statFd = null;
  self.statBuff = new Buffer(1024);

  self.pids = [];
  self.names = [];
  self.processes = {};
}
util.inherits(PUsage, events.EventEmitter);

function getState(self, callback) {
    var toRead = [function (cb) {
      fs.read(self.statFd, self.statBuff, 0, 1024, 0, cb);
    }];
    self.forEachProc(function (p) {
      if (!p.watch) return;
      toRead.push(function (cb) {
        fs.read(p.statFd, p.statBuff, 0, 1024, 0, function (err, num, buff) {
          cb(err, 'stat', p.name, num, buff);
        });
      });
      toRead.push(function (cb) {
        fs.read(p.ioFd, p.ioBuff, 0, 1024, 0, function (err, num, buff) {
          cb(err, 'io', p.name, num, buff);
        });
      });
      toRead.push(function (cb) {
        fs.read(p.statusFd, p.statusBuff, 0, 1024, 0, function (err, num, buff) {
          cb(err, 'status', p.name, num, buff);
        });
      });
    });
    async.parallel(toRead, function (error, results) {
      if (error) throw new Error('PUsage: could not read a /proc/ file: a process probably stopped running');
      var state = {
        total: parseTotalTime(results.shift()[1]),
        processes: {}
      };
      results.forEach(function (args) {
        if (!state.processes[args[1]]) state.processes[args[1]] = {};
        if (args[0] === 'stat')
          parseProcStat(args[3], state.processes[args[1]]);
        if (args[0] === 'status')
          parseProcStatus(args[3], state.processes[args[1]]);
        else if (args[0] === 'io')
          parseIoInfo(args[3], state.processes[args[1]]);
      });
    
      callback(error, state);
    });
}

function calcAvgUtil(current, log) {
  var some = log.slice(-10);
  return some.reduce(function (sum, e) {
    return sum + e.cpu;
  }, current) / (some.length + 1);
}

function stopLoop(self) {
  fs.close(self.statFd);
  fs.close(self.logStream);
  self.forEachProc(function (p) {
    fs.close(p.statFd);
    fs.close(p.statusFd);
    fs.close(p.ioFd);
  });
}

function serializeLogEntry(p, e) {
  return [
    e.time,             // 1
    p.pid,              // 2
    p.name,             // 3
    e.cpu,              // 4
    e.avg_cpu,          // 5
    e.user_cpu,         // 6
    e.sys_cpu,          // 7
    e.VmRSS,            // 8
    e.VmSize,           // 9
    e.rcharPerSecond,   // 10
    e.wcharPerSecond,   // 11
    e.syscrPerSecond,   // 12
    e.syscwPerSecond    // 13
  ].map(function (e) { return e.toString(); }).join(',') + '\n';
}

function loop(self, state_before) {
    if (!self.running) return stopLoop(self);
    getState(self, function (error, state_after) {
      state_after.time = os.uptime() - self.startTime;
      if (error) throw error;
      if (state_before !== null) {
        var elapsed = state_after.time - state_before.time;
        var total_time = state_after.total - state_before.total;
        var utime, stime, user_util, sys_util, tot_util;
        var logLine, manyLogLines = '';
        self.forEachProc(function (p) {
          if (!p.watch) return;
          if (!state_before.processes[p.name]) return;
          utime = state_after.processes[p.name].utime - state_before.processes[p.name].utime;
          stime = state_after.processes[p.name].stime - state_before.processes[p.name].stime;
          user_util = numCpus * 100 * utime / total_time;
          sys_util = numCpus * 100 * stime / total_time;
          tot_util = user_util + sys_util;

          var e = {
            pid: p.pid,
            name: p.name,
            time: state_after.time,
            cpu: tot_util,
            avg_cpu: calcAvgUtil(tot_util, p.log),
            user_cpu: user_util,
            sys_cpu: sys_util,
            utime: utime,
            stime: stime,
            VmRSS: state_after.processes[p.name].VmRSS,
            VmSize: state_after.processes[p.name].VmSize,
            syscr: state_after.processes[p.name].syscr,
            syscw: state_after.processes[p.name].syscw,
            syscrPerSecond: (state_after.processes[p.name].syscr - state_before.processes[p.name].syscr) / elapsed,
            syscwPerSecond: (state_after.processes[p.name].syscw - state_before.processes[p.name].syscw) / elapsed,
            rchar: state_after.processes[p.name].rchar,
            wchar: state_after.processes[p.name].wchar,
            rcharPerSecond: (state_after.processes[p.name].rchar - state_before.processes[p.name].rchar) / elapsed,
            wcharPerSecond: (state_after.processes[p.name].wchar - state_before.processes[p.name].wchar) / elapsed
          };
          p.log.push(e);
          logLine = serializeLogEntry(p, e);
          manyLogLines += logLine;
          self.emit('log', e, logLine);
        });
        if (self.logStream && manyLogLines.length > 0)
            self.logStream.write(manyLogLines);
      }

      setTimeout(function () {
        loop(self, state_after);
      }, self.interval);
    });
}

PUsage.prototype.forEachProc = function (callback) {
  var self = this;
  self.names.forEach(function (n) {
    callback(self.processes[n]);
  });
};

PUsage.prototype.start = function () {
  var self = this;
  if (self.running) throw new Error('PUsage.start(): already running');
  self.running = true;
  
  fs.open('/proc/stat', 'r', function (error, fd) {
    if (error) throw error;
    self.statFd = fd;
    self.startTime = os.uptime();
    if (self.logStream)
      self.logStream.write("Time,PID,ProcessName,CPU,AvgCPU,UserCPU,SysCPU,VmRSS,VmSize,rcharPerSecond,wcharPerSecond,syscrPerSecond,syscwPerSecond\n");
    loop(self, null);
  });
};

PUsage.prototype.stop = function () {
  var self = this;
  self.running = false;
};

function getProccess(self, pidOrName) {
  var p, name;
  for (name in self.processes) {
    if (!self.processes.hasOwnProperty(name)) continue;
    p = self.processes[name];
    if (p.name === pidOrName || p.pid === pidOrName)
      return p;
  }
  return null;
}

PUsage.prototype.unwatch = function (pidOrName) {
  var self = this;
  var p = getProccess(self, pidOrName);
  if (!p) throw new Error("PUsage.unwatch(): could not find process: " + pidOrName);
  p.watch = false;
};

PUsage.prototype.watch = function () {
  var self = this;
  var pid = arguments[0];
  if (pid === parseInt(pid, 10)) { // is interger, i.e. PID
    var statBuff = new Buffer(1024);
    var statusBuff = new Buffer(1024);
    var ioBuff = new Buffer(1024);
    fs.open('/proc/' + pid.toString() + '/stat', 'r', function (error, statFd) {
      if (error) throw error;
      fs.read(statFd, statBuff, 0, 1024, 0, function (error, num, buff) {
        if (error) throw error;
        var proc = {
          name: rePname.exec(buff.toString())[1],
          watch: true,
          pid: pid,
          statFd: statFd,
          statusFd: fs.openSync('/proc/' + pid.toString() + '/status', 'r'),
          ioFd: fs.openSync('/proc/' + pid.toString() + '/io', 'r'),
          statBuff: statBuff,
          statusBuff: statusBuff,
          ioBuff: ioBuff,
          log: []
        };
        self.processes[proc.name] = proc;
        self.pids.push(pid);
        self.names.push(proc.name);
        if (!self.running)
          self.start();
      });
    });
  }
  else if (typeof arguments[0] === 'string'){ // it should be a process name
    var pname = arguments[0];
    getPidOf(pname, function (error, pids) {
      if (error) throw new Error("PUsage.watch(): process '" + pname + "' not running: `pidof` returned code " + error.code.toString());
      self.watch(pids[pids.length - 1]);
    });
  }
  else
    throw new TypeError("PUsage.watch(): invalid arguments: expects a PID or process name.");
};


module.exports = function (opts) {
  return new PUsage(opts);
};
module.exports.PUsage = PUsage;
