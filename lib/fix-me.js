var readline = require('readline');
var spawn = require('child_process').spawn;
var fs = require('fs');

var DEFAULT_PATHS = ['./'];
var DEFAULT_STRINGS = ['BUG', 'FIXME', 'HACK', 'TODO', 'XXX'];
var DEFAULT_EXCLUDED_FILES = [];
var GREP_OPTIONS = [
  '--binary-files=without-match',
  '--extended-regexp',
  '--line-number',
  '--only-matching',
  '--recursive',
  '--with-filename',
  '--word-regexp',
];

function FixMe(writable) {
  this.output = writable || process.stdout;
}

FixMe.prototype.run = function(engineConfig) {
  var paths, strings, excluded_files;

  if (engineConfig) {
    paths = engineConfig.include_paths;
  } else {
    paths = DEFAULT_PATHS;
  }

  if (engineConfig && engineConfig.config) {
      if (engineConfig.config.strings) {
        strings = engineConfig.config.strings;
      } else {
          strings = DEFAULT_STRINGS;
      }

      if (engineConfig.config.excluded_files) {
          excluded_files = engineConfig.config.excluded_files;
      } else {
          excluded_files = DEFAULT_EXCLUDED_FILES;
      }
  }

  this.find(paths, strings);
};

var isItsOwnConfigFile = function(path) {
  return path.indexOf(".codeclimate.yml") !== -1;
};

var isAYamlComment = function(path, lineNumber) {
  var lines = fs.readFileSync(path, "utf8").split("\n");
  var line = lines[lineNumber - 1] || "";
  return line.match(/^\s*#/);
};

var isExcludedFile = function(path) {
    for (var i = 0; i < excluded_files.length; i++) {
        if (path.indexOf(excluded_files[i]) !== -1) {
            return true;
        }
    }
    return false;
};

FixMe.prototype.find = function(paths, strings, callback) {
  var pattern = `(${strings.join('|')})`;
  var grep = spawn('grep', [...GREP_OPTIONS, pattern, ...paths]);

  readline.createInterface({ input: grep.stdout }).on('line', (line) => {
    var parts = line.split(':');
    var path = parts[0].replace(/^\/code\//, '');
    var lineNumber = parseInt(parts[1], 10);
    var matchedString = parts[2];

    if (!path || !lineNumber || !matchedString) {
      process.stderr.write("Ignoring malformed output: " + line + "\n");
      return;
    }

    if(isItsOwnConfigFile(path) && !isAYamlComment(path, lineNumber)) { return; }
    if(isExcludedFile(path)) { return; }

    var issue = {
      'categories': ['Bug Risk'],
      'check_name': matchedString,
      'description': `${matchedString} found`,
      'location': {
        'lines': {
          'begin': lineNumber,
          'end': lineNumber,
        },
        'path': path,
      },
      'type': 'issue',
    };

    this.output.write(JSON.stringify(issue) + '\0');
  });

  if (callback) {
    grep.stdout.on('close', _ => callback());
  }
};

module.exports = FixMe;
