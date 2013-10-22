exports.ACStyles = {
  ACPlusStyle: function(stat) {
      if (stat.result == 0) {
        return '<td class="no"></td>';
      } else if (stat.result > 0) {
        return '<td class="ok">+' + (stat.attempt > 1 ? stat.attempt - 1 : '') + '</td>';
      } else {
        return '<td class="wa">-' + stat.attempt + '</td>';
      }
  },

  ACScoreStyle: function(stat) {
    var warning = '';
    if (stat.warning)
      warning = ' style="background-color: #ea3556; color: black" ';

    if (stat.result == 0)
      return '<td class="no"' + warning + '></td>';
    else if (stat.result > 0)
      return '<td class="ok"><div style="font-weight:600;">' + stat.score +
                  '</div><div style="font-size:75%;">+' +
                  (stat.attempt > 1 ? stat.attempt - 1 : '') + '</div></td>';
    else 
      return '<td class="wa"' + warning + '>-' + stat.attempt + '</td>';
  }
}

require("./Common.js");
require("./Scanner.js");

var problems = [];
var teams = [];
var teamNameMap = {};
var problemMap = {};
var teamPresenceMap = {};
var config = {
  teamAlias: {
    // 'team_from': 'team_to'
  },

  contestStartTime: [15, 0], // [hh, mm]

  calcScore: function(attempt, time) {
    return 100;
  },
  
  teamSortingComparator: function(team1, team2) {
    if (team1.solved != team2.solved)
    return team2.solved - team1.solved;

    return team2.penalty - team1.penalty;
  },

  groupable: function(t1, t2) { // : bool
    return t1.solved == t2.solved;
  },

  contestMinima: {
    // 'contest_id': #of problems
  },

  monitorStyle: {
    ACStyle: exports.ACStyles.ACPlusStyle,

    getMonitorHeader: function(common) {
      var html = [];
      html.push('<h2>', common.contest, '</h2>');
      html.push('Started at: ', '<b>', common.startat, '</b><br />');
      html.push('Duration: ', '<b>', common.contlen / 60, ':',
                      ('00' + common.contlen % 60).substring(0, 2), '</b><br />');
      html.push('State: ', '<b>', common.state, '</b><br />');
      html.push('<i>Last updated: ',
          (new Date((common.unixstart + Number(common.now)) * 1000)).toString(), '</i>');
      return html.join('\n');
    },

    tableColumns: [
      'rank', 'id', 'name', 'problems', 'solved', 'penalty', 'score', 'rank'
    ],

    tableColumnNames: {
      rank: 'Rank',
      id: 'ID',
      name: 'Team',
      solved: '=',
      penalty: 'Time',
      score: 'Score',
      failed: '&#8224;'
    }
  }
};

exports.run = function(config_) {
  extend(config, config_, true /*recursive*/);

  var common = {};

  for (var i in process.argv) {
    if (i <= 1) continue;

    var filename = process.argv[i];
    var filePrefix = '';
    var encoding = 'utf8';
    var match;
    if (match = filename.match(/(\d\d)(\d\d)(\d\d)_\S*/)) {
      var year = match[1],
          month = match[2],
          day = match[3];
      filePrefix = '' + month + day;
      encoding = 'utf8';
    }

    var new_common = read_dat(filename, filePrefix, encoding);
    if (!('unixstart' in common))
      common = new_common;
    else {
      common.unixstart = Math.min(common.unixstart, new_common.unixstart);
      common.contest = 'Total standings';
      common.contlen = 100500;
      common.state = 'STATS';
    }
  }

  // process.exit(1);

  teams.sort(config.teamSortingComparator);
  create_warnings();

  var output = getMonitor(common, problems, teams);

  var ws = fs.createWriteStream('/dev/stdout', {encoding: 'binary'});
  ws.write(output, 'binary');
  ws.end();
}

var parse_postered_file = function( file, problemPrefix ) { // : Object
  var s;
  var enableP = false;
  var scanner = new Scanner(file, {delimiters: '\n\r'});

  var submits = [];
  var common = {};


  while ((s = scanner.next()) != null) {
    if (s == '@for poster' || s == "@for poster2") {
      enableP = true;
      scanner.updateDelimiters('\n\r,');
      continue;
    }
    if (s.charAt(0) != '@')
      continue;

    if (!enableP) {
      var whs = s.indexOf(' ');
      var key = s.substring(1, whs);
      common[key] = s.substring(whs + 1);
      continue;
    }

    // parsing queries

    var msgType = s.charAt(1);
    // deleting first @c_
    s = s.substring(3);

    var obj = {};
    switch (msgType) {
      case 'p':
        obj.id = problemPrefix + s;
        obj.name = scanner.next();
        obj.prefix = problemPrefix;

        if (obj.id in problemMap) {
          break;
        }

        problemMap[obj.id] = problems.length;
        problems.push(obj);
        break;

      case 't':
        obj.id = s;
        scanner.next();
        scanner.next();
        scanner.updateDelimiters('\n\r');
        var teamNameRaw = scanner.next();
        obj.name = teamNameRaw;
        // delete some quotes that may wrap team name
        if (obj.name.charAt(0) == '"' && obj.name.charAt(obj.name.length - 1) == '"') {
          obj.name = obj.name.substring(1, obj.name.length - 1);
        }
        scanner.updateDelimiters('\n\r,');

        if (obj.id in config.teamAlias) {
          obj.id = config.teamAlias[obj.id];
          if (obj.id in teamPresenceMap)
            break;
          teamPresenceMap[obj.id] = teams.length;
        } else {
          if (!(obj.id in teamPresenceMap)) {
            teamPresenceMap[obj.id] = teams.length;
          } else {
            teams[teamPresenceMap[obj.id]].name = obj.name;
            break;
          }
        }

        teams.push(obj);
        break;

      case 's':
        obj.team = (s in config.teamAlias) ? config.teamAlias[s] : s;
        obj.problem = problemPrefix + scanner.next();
        obj.attempt = scanner.nextNumber();
        obj.timeStamp = scanner.nextNumber();
        obj.outcome = scanner.next();
        submits.push(obj);
        break;
    }
  }

  var parts = common.startat.split(/[\., :]/);
  for (var i in parts) {
    parts[i] = parseInt(parts[i], 10);
  }
  common.unixstart = new Date(parts[2], parts[1] - 1, parts[0], parts[3],
                              parts[4], parts[5]).getTime() / 1000;
  common.rightstart = new Date(parts[2], parts[1] - 1, parts[0],
      config.contestStartTime[0], config.contestStartTime[1], 0).getTime() / 1000;

  return {
    submits: submits,
    common: common
  };
}

var initialize_team_stats = function() { // : void
  for (var i in teams) {
    if (teams[i].id in teamNameMap && teamNameMap[teams[i].id] == i)
      continue;
    if (teams[i].id in teamNameMap) {
      // console.warn('skipped team ' + teams[i].id + ' when #' + i);
      teams[i].skip = true;
      teams[i].score = -1;
      continue;
    }
    // console.warn('team ' + teams[i].id + ' is #' + i);
    extend(teams[i], {
      penalty: 0,
      solved: 0,
      score: 0,
      problems: {},
      skip: false
    });
    teamNameMap[teams[i].id] = i;
  }
}

var read_dat = function( file, problemPrefix, encoding ) {
  if (problemPrefix === undefined) {
    problemPrefix = '';
  }
  if (encoding === undefined) {
    encoding = 'utf8';
  }

  var parsed = parse_postered_file(file, problemPrefix);
  var submits = parsed.submits;
  var common = parsed.common;

  initialize_team_stats();

  for (var i in submits) {
    var s = submits[i];
    // console.warn('submit, team = ' + s.team + ', problem = ' + s.problem);
    var teamI = teamNameMap[s.team];
    var problem = problemMap[s.problem];
    // console.warn('id = ' + teamI + ', problem = ' + problem);

    if (problem in teams[teamI].problems && teams[teamI].problems[problem].result > 0)
      continue;

    // console.warn("!!");

    if (s.outcome == 'OK' || s.outcome == 'AC') {
      var score = config.calcScore(s.attempt, s.timeStamp + common.unixstart - common.rightstart);
      teams[teamI].penalty += 20 * 60 * (s.attempt - 1) + s.timeStamp;
      teams[teamI].solved++;
      teams[teamI].problems[problem] = {
        result: 1,
        attempt: s.attempt,
        score: score
      };
      teams[teamI].score += score;
      // console.warn("ACCEPTED");
    } else {
      teams[teamI].problems[problem] = {
        result: -1,
        attempt: s.attempt,
        score: 0
      };
    }
  }

  return common;
}

var create_warnings = function() { // : void
  for (var contest_id in config.contestMinima) {
    var contest_problems = [];

    for (var i in problems)
      if (problems[i].prefix == contest_id)
        contest_problems.push(i);

    for (var i in teams) {
      var solved = 0;
      for (var j in contest_problems) {
        var problem_id = contest_problems[j];

        if (problem_id in teams[i].problems && teams[i].problems[problem_id].result > 0)
          solved++;
      }

      if (solved >= config.contestMinima[contest_id])
        continue;

      teams[i].failedContests = (teams[i].failedContests || 0) + 1;
      for (var j in contest_problems) {
        var problem_id = contest_problems[j];

        if (!(problem_id in teams[i].problems))
          teams[i].problems[problem_id] = {
            result: 0,
            score: 0
          };
          
        teams[i].problems[problem_id].warning = 1;
      }
    }
  }
}


var getMonitor = function(common, problems, teams) { // : String
  var odd = 1;
  var rank = 0;
  var team_n = 0;
  var old_group = {}
  var html = [];

  html.push('<html>');
    html.push('<head>');
      html.push('<title>Standings</title>');
      html.push('<link href="/monitor.css" rel="stylesheet" type="text/css" />');
      html.push('<meta http-equiv="content-type" content="text/html; charset=utf-8" />');
    html.push('</head>');
    html.push('<body>');
      html.push(config.monitorStyle.getMonitorHeader(common));
      html.push('<table border="1" cellpadding="4" class="mtab">');
        
        html.push('<tr class="head">');
        for (var coln in config.monitorStyle.tableColumns) {
          var col = config.monitorStyle.tableColumns[coln];
          if (col != 'problems') {
            html.push('<th>', config.monitorStyle.tableColumnNames[col], '</th>');
          } else {
            for (var i in problems) {
              html.push('<th width="35"><a title="', problems[i].name, '">', problems[i].id, '</a></th>');
            }
          }
        }
        html.push('</tr>');

        for (var i in teams) {
          if (teams[i].skip) {
            continue;
          }
          team_n++;
          if (!config.groupable(old_group, teams[i]))
            odd ^= 1;
          if (config.teamSortingComparator(teams[i], old_group) != 0)
            rank = team_n;

          var problemsRow = [];
          for (var j in problems) {
            var problemStat = teams[i].problems[j] || {result:0};
            problemsRow.push(config.monitorStyle.ACStyle(problemStat));
          }

          html.push('<tr class="', odd ? 'odd' : 'even', '">');
          for (var coln in config.monitorStyle.tableColumns) {
            var col = config.monitorStyle.tableColumns[coln];
            var tdStr = '';
            switch (col) {
              case 'rank':
                tdStr = '<td class="rk">' + rank + '</td>';
                break;
              case 'id':
                tdStr = '<td>' + teams[i].id + '</td>';
                break;
              case 'name':
                tdStr = '<td style="white-space: nowrap">' + teams[i].name + '</td>';
                break;
              case 'solved':
                tdStr = '<td class="solv">' + teams[i].solved + '</td>';
                break;
              case 'penalty':
                tdStr = '<td class="pen">' + teams[i].penalty + '</td>';
                break;
              case 'score':
                tdStr = '<td class="scr">' + teams[i].score + '</td>';
                break;
              case 'failed':
                tdStr = '<td>' + (teams[i].failedContests || 0) + '</td>';
                break;
              case 'problems':
                tdStr = problemsRow.join('');
                break;
            }
            html.push(tdStr);
          }

          html.push('</tr>');
          old_group = teams[i];
        }
      html.push('</table>');
    html.push('</body>');
  html.push('</html>');

  return html.join('\n');
}

