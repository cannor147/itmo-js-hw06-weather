'use strict';

global.fetch = require('node-fetch');

const ENDPOINT_PREFIX = `https://api.weather.yandex.ru/v1/forecast?hours=false&limit=7&geoid=`;

const TRANSLATE_MAP = new Map();
TRANSLATE_MAP.set("Can't generate a trip.", 'Не могу построить маршрут!');
TRANSLATE_MAP.set(
  'Failed to get weather from Yandex.Weather: ',
  'Ошибка при получении данных о погоде из Яндекс.Погода: '
);

/**
 * @typedef {object} TripItem Город, который является частью маршрута.
 * @property {number} geoid Идентификатор города
 * @property {number} day Порядковое число дня маршрута
 */

class TripBuilder {
  constructor(geoids) {
    this._geoids = geoids;
    this._conditions = [];
    this._maxDays = Infinity;
  }

  _getForecast(geoid) {
    return global
      .fetch(ENDPOINT_PREFIX + geoid)
      .then(response => response.json())
      .catch(error => {
        throw new Error(TRANSLATE_MAP.get('Failed to get weather from Yandex.Weather: ') + error);
      })
      .then(json => ({
        geoid: json['geo_object']['locality']['id'],
        forecast: json['forecasts'].map(day => day['parts']['day_short']['condition'])
      }));
  }

  _addCondition(condition, times) {
    for (let i = 0; i < times; i++) {
      this._conditions.push(condition);
    }
  }

  /**
   * Метод, добавляющий условие наличия в маршруте
   * указанного количества солнечных дней
   * Согласно API Яндекс.Погоды, к солнечным дням
   * можно приравнять следующие значения `condition`:
   * * `clear`;
   * * `partly-cloudy`.
   * @param {number} days количество дней
   * @returns {object} Объект планировщика маршрута
   */
  sunny(days) {
    this._addCondition(['clear', 'partly-cloudy'], days);

    return this;
  }

  /**
   * Метод, добавляющий условие наличия в маршруте
   * указанного количества пасмурных дней
   * Согласно API Яндекс.Погоды, к солнечным дням
   * можно приравнять следующие значения `condition`:
   * * `cloudy`;
   * * `overcast`.
   * @param {number} days количество дней
   * @returns {object} Объект планировщика маршрута
   */
  cloudy(days) {
    this._addCondition(['cloudy', 'overcast'], days);

    return this;
  }

  /**
   * Метод, добавляющий условие максимального количества дней.
   * @param {number} days количество дней
   * @returns {object} Объект планировщика маршрута
   */
  max(days) {
    this._maxDays = days;

    return this;
  }

  /**
   * Метод, возвращающий Promise с планируемым маршрутом.
   * @returns {Promise<TripItem[]>} Список городов маршрута
   */
  build() {
    return Promise.all(this._geoids.map(this._getForecast)).then(cities => {
      const trip = [];
      const geoidToDayMap = new Map();

      const generateTrip = () => {
        const today = trip.length;

        for (const city of cities) {
          const cityDays = geoidToDayMap.has(city.geoid) ? geoidToDayMap.get(city.geoid) : 0;
          const cityCurrent = trip.length > 0 && city.geoid === trip[trip.length - 1];
          const cityGoodForecast = this._conditions[today].includes(city.forecast[today]);

          if (cityGoodForecast && cityDays < this._maxDays && (cityDays === 0 || cityCurrent)) {
            geoidToDayMap.set(city.geoid, cityDays + 1);
            trip.push({ geoid: city.geoid, day: today + 1 });

            if (trip.length === this._conditions.length || generateTrip()) {
              return true;
            }

            geoidToDayMap.set(city.geoid, cityDays);
            trip.pop();
          }
        }

        return false;
      };

      if (generateTrip()) {
        return trip;
      }

      throw new Error(TRANSLATE_MAP.get("Can't generate a trip."));
    });
  }
}

/**
 * Фабрика для получения планировщика маршрута.
 * Принимает на вход список идентификаторов городов, а
 * возвращает планировщик маршрута по данным городам.
 *
 * @param {number[]} geoids Список идентификаторов городов
 * @returns {TripBuilder} Объект планировщика маршрута
 * @see https://yandex.ru/dev/xml/doc/dg/reference/regions-docpage/
 */
function planTrip(geoids) {
  return new TripBuilder(geoids);
}

module.exports = {
  planTrip
};
