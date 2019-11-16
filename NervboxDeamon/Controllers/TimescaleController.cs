using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.Helpers;
using NervboxDeamon.Models.View;

namespace NervboxDeamon.Controllers
{

    public enum BucketType { Second, Minute, Hour, Day, Week, Auto };
    public enum BucketAggregation { Avg, Max, Min, Count, Sum }

    public class SimpleTimescaleQueryModel
    {
        public string Metric { get; set; }
        public int BucketSize { get; set; }
        public BucketType BucketType { get; set; }
        public BucketAggregation Aggregation { get; set; }
        public QueryRange Range { get; set; }
        public int Limit { get; set; }
    }

    public class GenericTimescaleQueryModel
    {
        public List<GenericTimescaleMetric> Metrics { get; set; }
        public int BucketSize { get; set; }
        public BucketType BucketType { get; set; }
        public DateTime? Start { get; set; }
        public DateTime? End { get; set; }
        public QueryRange Range { get; set; }
        public int Limit { get; set; }
    }

    public class GenericTimescaleMetric
    {
        public string Metric { get; set; }
        public BucketAggregation Aggregation { get; set; }
    }

    /// <summary>
    /// Controller für die Abfrage von TimeScale Werten aus den Aufzeichnungen
    /// </summary>
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class TimescaleController : NervboxBaseController<TimescaleController>
    {

        // GET api/values
        [HttpPost]
        [Route("simpleQuery")]
        public IActionResult SimpleQuery(SimpleTimescaleQueryModel model)
        {
            Stopwatch sw = new Stopwatch();
            sw.Start();

            var conn = new NpgsqlConnection(DbContext.Database.GetDbConnection().ConnectionString);
            conn.Open();

            using (var cmd = conn.CreateCommand())
            {
                var bucketSizeString = string.Format("{0} {1}", model.BucketSize, model.BucketType.ToString().ToLowerInvariant());

                //where clause (date range)        
                bool success = QueryRangeHelper.GetDatesOfRange(model.Range, null, null, out DateTime dtUTCStart, out DateTime dtUTCEnd);

                cmd.CommandText = string.Format(@"SELECT time_bucket_gapfill('{0}', time, '{3}', '{4}') AS ke, {1}({2}) AS va FROM soundusage WHERE time >= @start AND time <= @end GROUP BY ke ORDER BY ke DESC LIMIT @limit;", bucketSizeString, model.Aggregation.ToString().ToLowerInvariant(), model.Metric, dtUTCStart.ToString("yyyy-MM-dd"), dtUTCEnd.ToString("yyyy-MM-dd"));
                cmd.CommandType = System.Data.CommandType.Text;
                cmd.Parameters.AddWithValue("@limit", model.Limit);

                cmd.Parameters.AddWithValue("@start", dtUTCStart);
                cmd.Parameters.AddWithValue("@end", dtUTCEnd);

                List<SimpleQueryRecordViewModel> list = new List<SimpleQueryRecordViewModel>();
                using (var result = cmd.ExecuteReader())
                {
                    while (result.Read())
                    {
                        object v = null;

                        if (result[result.GetOrdinal("va")] != DBNull.Value)
                        {
                            v = result.GetDouble(result.GetOrdinal("va"));
                        }

                        list.Add(new SimpleQueryRecordViewModel()
                        {
                            K = result.GetDateTime(result.GetOrdinal("ke")),
                            V = v
                        });
                    }
                }

                conn.Close();

                //reverse list
                list = list.OrderBy(a => a.K).ToList();

                sw.Stop();

                return Ok(new
                {
                    Values = list,
                    Duration = sw.Elapsed.TotalMilliseconds
                });
            }
        }


        // GET api/values
        [HttpPost]
        [Route("genericQuery")]
        public IActionResult GenericQuery(GenericTimescaleQueryModel model)
        {
            Stopwatch sw = new Stopwatch();
            sw.Start();

            var conn = new NpgsqlConnection(DbContext.Database.GetDbConnection().ConnectionString);
            conn.Open();

            using (var cmd = conn.CreateCommand())
            {
                //auto bucket size if custom range
                if (model.Range == QueryRange.CUSTOM)
                {
                    TimeSpan range = model.End.Value - model.Start.Value;

                    if (range.TotalDays > 365 * 2)
                    {
                        model.BucketType = BucketType.Week;
                        model.BucketSize = 1;
                        model.Limit = -1;
                    }

                    else if (range.TotalDays > 365)
                    {
                        model.BucketType = BucketType.Day;
                        model.BucketSize = 1;
                        model.Limit = -1;
                    }

                    else if (range.TotalDays > 7)
                    {
                        model.BucketType = BucketType.Hour;
                        model.BucketSize = 5;
                        model.Limit = -1;
                    }

                    else if (range.TotalDays > 1)
                    {
                        model.BucketType = BucketType.Hour;
                        model.BucketSize = 1;
                        model.Limit = -1;
                    }

                    else if (range.TotalHours > 1)
                    {
                        model.BucketType = BucketType.Minute;
                        model.BucketSize = 5;
                        model.Limit = -1;
                    }

                    else if (range.TotalMinutes < 60)
                    {
                        model.BucketType = BucketType.Second;
                        model.BucketSize = 5;
                        model.Limit = -1;
                    }
                }

                //bucketSize
                var bucketSizeString = string.Format("{0} {1}", model.BucketSize, model.BucketType.ToString().ToLowerInvariant());

                //fields
                var valueFields = new List<string>();
                foreach (var field in model.Metrics)
                {
                    if (model.Range == QueryRange.LIVE)
                    {
                        valueFields.Add($"{field.Metric} AS {field.Metric}");
                    }
                    else
                    {
                        valueFields.Add($"{field.Aggregation.ToString()}({field.Metric}) AS {field.Metric}");
                    }
                }

                var valueFieldsString = string.Join(", ", valueFields);

                //where clause (date range)        
                bool success = QueryRangeHelper.GetDatesOfRange(model.Range, model.Start, model.End, out DateTime dtUTCStart, out DateTime dtUTCEnd);

                string limitString = model.Limit > 0 ? "LIMIT @limit" : "";

                if (model.Range == QueryRange.LIVE)
                {
                    //real records, no time_buckets
                    cmd.CommandText = string.Format($"SELECT time AS ke, {valueFieldsString} FROM soundusage WHERE time >= @start AND time <= @end ORDER BY ke DESC {limitString};");
                }
                else
                {
                    cmd.CommandText = string.Format($"SELECT time_bucket_gapfill('{bucketSizeString}', time, '{dtUTCStart.ToString("yyyy-MM-dd")}', '{dtUTCEnd.ToString("yyyy-MM-dd")}') AS ke, {valueFieldsString} FROM soundusage WHERE time >= @start AND time <= @end GROUP BY ke ORDER BY ke DESC {limitString};");
                }

                cmd.CommandType = System.Data.CommandType.Text;

                if (model.Limit > 0)
                {
                    cmd.Parameters.AddWithValue("@limit", model.Limit);
                }

                cmd.Parameters.AddWithValue("@start", dtUTCStart);
                cmd.Parameters.AddWithValue("@end", dtUTCEnd);

                List<GenericQueryRecordViewModel> list = new List<GenericQueryRecordViewModel>();
                using (var result = cmd.ExecuteReader())
                {
                    while (result.Read())
                    {
                        List<dynamic> values = new List<dynamic>();
                        foreach (var metric in model.Metrics)
                        {
                            if (result[result.GetOrdinal(metric.Metric)] == DBNull.Value)
                            {
                                values.Add(null);
                            }
                            else
                            {
                                values.Add(result.GetDouble(result.GetOrdinal(metric.Metric)));
                            }
                        }

                        list.Add(new GenericQueryRecordViewModel()
                        {
                            K = result.GetDateTime(result.GetOrdinal("ke")),
                            Value = values
                        });
                    }
                }

                conn.Close();

                //reverse list
                list = list.OrderBy(a => a.K).ToList();

                sw.Stop();

                return Ok(new
                {
                    Series = model.Metrics.Select(s => s.Metric).ToArray(),
                    Values = list,
                    Duration = sw.Elapsed.TotalMilliseconds
                });
            }
        }
    }

    public class SimpleQueryRecordViewModel
    {
        public DateTime K { get; set; }
        public object V { get; set; }
    }

    public class GenericQueryRecordViewModel
    {
        public DateTime K { get; set; }
        public List<dynamic> Value { get; set; }
    }

}