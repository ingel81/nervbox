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

namespace NervboxDeamon.Controllers
{

  public enum BucketType { Second, Minute, Hour, Day, Week };
  public enum BucketAggregation { Avg, Max, Min, Count, Sum }

  public class BucketQueryModel
  {
    public string Metric { get; set; }
    public int BucketSize { get; set; }
    public BucketType BucketType { get; set; }
    public BucketAggregation Aggregation { get; set; }
    public int Limit { get; set; }
  }

  [AllowAnonymous]
  [Route("api/[controller]")]
  [ApiController]
  public class TimescaleController : NervboxBaseController<TimescaleController>
  {

    // GET api/values
    [HttpPost]
    [Route("genericQuery")]
    public IActionResult GetTemperatureHistory(BucketQueryModel model)
    {
      Stopwatch sw = new Stopwatch();
      sw.Start();

      var conn = new NpgsqlConnection(DbContext.Database.GetDbConnection().ConnectionString);
      conn.Open();

      using (var cmd = conn.CreateCommand())
      {
        var bucketSizeString = string.Format("{0} {1}", model.BucketSize, model.BucketType.ToString().ToLowerInvariant());
        cmd.CommandText = string.Format(@"SELECT time_bucket('{0}', time) AS ke, {1}({2}) AS va FROM soundusage GROUP BY ke ORDER BY ke DESC LIMIT @limit;", bucketSizeString, model.Aggregation.ToString().ToLowerInvariant(), model.Metric);
        cmd.CommandType = System.Data.CommandType.Text;
        cmd.Parameters.AddWithValue("@limit", model.Limit);

        List<RecordViewModel> list = new List<RecordViewModel>();
        using (var result = cmd.ExecuteReader())
        {
          while (result.Read())
          {
            list.Add(new RecordViewModel()
            {
              K = result.GetDateTime(result.GetOrdinal("ke")),
              V = result.GetDouble(result.GetOrdinal("va"))
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
  }

  public class RecordViewModel
  {
    public DateTime K { get; set; }
    public double V { get; set; }
  }
}