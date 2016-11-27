const imdb = require('imdb-api');
const request = require('request');
const parseTorrentName = require('parse-torrent-name');
const path = require('path');
const fs = require('fs');
var sanitizeFileName = require('sanitize-filename');
var _ = require('lodash');

function pad(num, size) {
    var s = String(num);
    while (s.length < size) s = '0' + s;
    return s;
}

function sanitize(str) {
    return sanitizeFileName(str).trim().replace(/ |-/g, '_').replace(/'/g, '').toLowerCase();
}

function getMatchingTvEpisode(series, episode) {
  return series.episodes().then(episodes => {
    // TODO: implement matching based on episode name instead of number...?
    return _.filter(episodes, {season: episode.season, 
                               episode: episode.episode})[0];
  });
}

function getTvFileName(info) {
  const parts = _.filter([
      info.title,
      `s${pad(info.season, 2)}e${pad(info.episode, 2)}`,
      info.name,
      info.imdbid
  ], p => !_.isNil(p));
  return sanitize(parts.join('.'));
}


function getMovieFileName(info) {
  return sanitize([info.title, info.year, info.imdbid].join('.'));
}

function getMediaInfo(fileName) {
  const imdbIdMatch = /(tt\d{3,})/i.exec(fileName);
  if (imdbIdMatch) {
    return getById(imdbIdMatch[1]);
  } else {
    const info = parseTorrentName(fileName);
    return imdb.getReq({name: info.title, year: info.year});
  }
}

function rename(oldFilePath, newFileName) {
  const newFilePath = path.join(path.dirname(oldFilePath), 
                                newFileName + path.extname(oldFilePath));
  // TODO: implement dry run and ask for confirmation...
  fs.rename(oldFilePath, newFilePath, err => {
    err ? console.error(err) : console.log(`${oldFilePath} -> ${newFilePath}`);
  });
}

// FIXME: the imdb node api cannot handle searching episodes by id? 
function getById(id) {
  return new Promise((resolve, reject) => {
    request(`http://www.omdbapi.com/?i=${id}&plot=short&r=json`, (error, response, body) => {
      if (!error && response.statusCode == 200) {
        resolve(_.mapKeys(JSON.parse(body), (value, key) => {
          return key.toLowerCase();
        }));
      } else {
        reject(error);
      }
    });
  });
}

function main() {
  process.argv.slice(2).forEach(filePath => {
    const fileName = path.basename(filePath, path.extname(filePath));
    getMediaInfo(fileName).then(media => {
      // console.log(media);
      switch(media.type) {
        case 'series':
        // TODO: clean this up...
          const info = parseTorrentName(fileName); // TODO: dont call this again
          getMatchingTvEpisode(media, info).then(episode => {
            rename(filePath, getTvFileName(_.merge(info, episode)));
          });
          break;
        case 'episode':
          getById(media.seriesid).then(series => {
            // TODO: clean this up - make function accept (series, episode)...
            media.name = media.title;
            media.title = series.title;
            rename(filePath, getTvFileName(media));
          });
          break;
        case 'movie':
          rename(filePath, getMovieFileName(media));
          break;
        default: 
          console.error('Unidentified media type');
      }
    });
  });
}

main();
