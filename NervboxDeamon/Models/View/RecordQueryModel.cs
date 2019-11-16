using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace NervboxDeamon.Models.View
{
  public enum ExportFormat
  {
    CSV,
    Excel
  }

  public enum QueryRange
  {
    CURRENTHOUR,
    CURRENTDAY,
    CURRENTWEEK,
    CURRENTMONTH,
    CURRENTYEAR,
    LIVE,
    LAST60MINUTES,
    LAST24HOURS,
    LAST7DAYS,
    LAST30DAYS,
    LAST365DAYS,
    CUSTOM
  }

  public class RecordQueryModel
  {
    public QueryRange Range { get; set; }

    public bool DoCount { get; set; }

    public int Skip { get; set; }
    public int Size { get; set; }

    public DateTime? Start { get; set; }
    public DateTime? End { get; set; }

    public bool ExportCSV { get; set; }

  }
}
