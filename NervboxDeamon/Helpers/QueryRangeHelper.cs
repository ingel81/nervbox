using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using NervboxDeamon.Models.View;

namespace NervboxDeamon.Helpers
{
  public static class QueryRangeHelper
  {
    public static bool GetDatesOfRange(QueryRange range, DateTime? start, DateTime? end, out DateTime dtUTCStart, out DateTime dtUTCEnd)
    {
      dtUTCStart = DateTime.UtcNow;
      dtUTCEnd = DateTime.UtcNow.AddDays(-1);

      //custom range
      if (range == QueryRange.CUSTOM)
      {
        if (start.HasValue)
        {
          dtUTCStart = start.Value.Date;
        }

        if (end.HasValue)
        {
          dtUTCEnd = end.Value.Date.AddHours(23).AddMinutes(59).AddSeconds(59).AddMilliseconds(999);
        }
      }
      else
      {
        switch (range)
        {
          case QueryRange.CURRENTHOUR:
            dtUTCEnd = DateTime.UtcNow;
            dtUTCStart = new DateTime(dtUTCEnd.Year, dtUTCEnd.Month, dtUTCEnd.Day, dtUTCEnd.Hour, 0, 0);
            break;

          case QueryRange.CURRENTDAY:
            dtUTCEnd = DateTime.UtcNow;
            dtUTCStart = dtUTCEnd.Date;
            break;

          case QueryRange.CURRENTWEEK:
            dtUTCEnd = DateTime.UtcNow;
            dtUTCStart = dtUTCEnd.Date.StartOfWeek(DayOfWeek.Monday).Date;
            break;

          case QueryRange.CURRENTMONTH:
            dtUTCEnd = DateTime.UtcNow;
            dtUTCStart = new DateTime(dtUTCEnd.Year, dtUTCEnd.Month, 1).Date;
            break;

          case QueryRange.CURRENTYEAR:
            dtUTCEnd = DateTime.UtcNow;
            dtUTCStart = new DateTime(dtUTCEnd.Year, 1, 1).Date;
            break;

          case QueryRange.LIVE:
            dtUTCEnd = DateTime.UtcNow;
            dtUTCStart = dtUTCEnd.AddSeconds(-300);
            break;

          case QueryRange.LAST60MINUTES:
            dtUTCEnd = DateTime.UtcNow;
            dtUTCStart = dtUTCEnd.AddMinutes(-60);
            break;

          case QueryRange.LAST24HOURS:
            dtUTCEnd = DateTime.UtcNow;
            dtUTCStart = dtUTCEnd.AddHours(-24);
            break;

          case QueryRange.LAST7DAYS:
            dtUTCEnd = DateTime.UtcNow;
            dtUTCStart = dtUTCEnd.AddDays(-7);
            break;

          case QueryRange.LAST30DAYS:
            dtUTCEnd = DateTime.UtcNow;
            dtUTCStart = dtUTCEnd.AddDays(-30);
            break;

          case QueryRange.LAST365DAYS:
            dtUTCEnd = DateTime.UtcNow;
            dtUTCStart = dtUTCEnd.AddDays(-365);
            break;

          default:
            throw new Exception($"Unknown Range: {range.ToString()}");
        }
      }

      return true;
    }

  }
}
