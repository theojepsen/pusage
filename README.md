PUsage
==========
Uses the files in `/proc` to monitor and log processes' use of system
resources, such as CPU, memory and IO.

Usage (of pusage)
=================
```javascript
var pusage = require('pusage')({interval: 500});

var firefox = require('child_process').spawn('firefox');
pusage.watch(firefox.pid);

pusage.on('log', function (stats) {
  console.log(stats.time, stats.name, 'CPU:', stats.cpu, 'VmSize:', stats.VmSize);
});

setTimeout(function () {
  pusage.stop();
  firefox.kill();
}, 5000);
```

API
-----
pusage is instantiated with an options hash with the following (all
optional) fields:
  - `interval`: the time (ms) to wait in between collecting stats from
    `/proc`.
  - `logStream`: a writable stream to log stats to.
  - `logFile`: a filename (string) to log stats to. Overrides `logStream`.

For example:

```javascript
var opts = {
    interval: 1000,  // 1 second

    logStream: fs.createWriteStream('plot/firefox.csv')
    // or, equivalently:
    logFile: 'plot/firefox.csv'
};
var pusage = require('pusage')(opts);
```

#### .watch(pidOrName, [logFileOrStream])
Start watching a process and logging its usage stats. The first argument
can either be the PID (integer) or name (string) of the process to
watch. The second optional argument can either be a filename (string) or
writable stream to write the log to (similar to the global `logStream`
option). An error is thrown if the process is not running.

#### .unwatch(pidOrName)
Stop watching a process and logging its usage stats. The argument can
either be the PID (integer) or name (string) of the process to watch.
This throws an error if the process is not currently being watched.

#### .stop()
Stop watching all processes and close all open files, including log
files.

#### event 'log'
Emitted whenever the stats are collected for a process (i.e. every
`interval` ms).  Returns two arguments: a stats object and a serialized
stats line. For example:

```javascript
pusage.on('log', function (stats, line) {
  expect(stats).to.be.an('object');
  expect(stats.pid).to.be('number');
  expect(stats.name).to.be('string');
  expect(line).to.be.a('string');
});
```

An example of the stats object:

```javascript
{
  /* General */
  time: 7.027885462041013,            // Time since starting pusage
  pid: 939,                           // PID of process
  name: 'firefox',                    // Process name

  /* CPU */
  cpu: 54.82233502538071,             // CPU utilization (user + sys)
  avg_cpu: 35.86264204710762,         // Averaged
  user_cpu: 50.76142131979695,        // User CPU utilization
  sys_cpu: 4.060913705583756,         // Sys CPU utilization

  /* Memory */
  VmRSS: 146320,                      // Resident set size (kB)
  VmSize: 785104,                     // Virtual memory size (kB)

  /* IO */
  syscr: 1712,                        // Total read syscalls
  syscw: 2075,                        // Total write syscalls
  syscrPerSecond: 293.24189755881355, // Read syscall rate (char/s)
  syscwPerSecond: 316.18259022497926, // Write syscall rate (char/s)
  rchar: 9757376,                     // Total chars read
  wchar: 6080253,                     // Total chars written
  rcharPerSecond: 354074.62998096336, // Char read rate
  wcharPerSecond: 195644.21158558258  // Char write rate
}
```


Command Line
============
You can also run pusage directly from the command line:
```shell
$ cd pusage
$ ./index.js
Usage: node ./index.js [OPTIONS] <PID|PROCESS_NAME>...

Options:
  -h, --help      Display this message.
  -i, --interval  Polling interval (ms) for gathering stats.       [default: 500]
  -e, --execute   Execute a command and monitor its system usage.  [default: false]
  -o, --outfile   File to write to. Defaults to stdout.            [default: "-"]

$ ./index.js -i 1000 -o plot/firefox.csv -e firefox
Time,PID,ProcessName,CPU,AvgCPU,UserCPU,SysCPU,VmRSS,VmSize,rcharPerSecond,wcharPerSecond,syscrPerSecond,syscwPerSecond
1.0071773050003685,27350,firefox,62.311557788944725,62.311557788944725,54.2713567839196,8.040201005025125,73560,587136,1357690.3889754347,635477.9925159606,471.1547780105705,599.9237745431205
2.011184804025106,27350,firefox,37.37373737373738,49.842647581341055,34.343434343434346,3.0303030303030303,92756,621708,496433.54306033865,337430.7466120358,107.56891766735599,189.24161441479293
3.012810421991162,27350,firefox,13.131313131313131,37.60553609799842,12.121212121212121,1.0101010101010102,97912,652464,51583.14551191017,1184932.7520297323,48.92047399855997,61.899375263484046
```

Portability (OS Support)
========================
So far, only UNIX is supported (or any OS that has process info in the
`/proc/` directory)

Graphing
========
[Gnuplot](http://www.gnuplot.info/) can be used to plot the output
generated by pusage.

License
=======
MIT (see LICENSE file). (c) Theo Jepsen
