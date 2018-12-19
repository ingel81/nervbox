using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;

namespace NervboxDeamon.DbModels
{

  public enum SettingType { Boolean, String, Int, Double, JSON }
  public enum SettingScope { None, General, System, Module, Network }

  [Table("settings")]
  public class Setting
  {
    [Key]
    [Required]
    public string Key { get; set; }

    [Required]
    public string Description { get; set; }

    [NotMapped]
    public SettingType SettingType { get; set; }

    [Required]
    [MaxLength(50)]
    [Column("SettingType")]
    [JsonIgnore]
    public string SettingTypeString
    {
      get
      {
        return SettingType.ToString();
      }
      private set
      {
        SettingType = SettingType.Parse<SettingType>(value);
      }
    }


    [NotMapped]
    public SettingScope SettingScope { get; set; }

    [Required]
    [MaxLength(50)]
    [Column("SettingScope")]
    [JsonIgnore]
    public string SettingScopeString
    {
      get
      {
        return SettingScope.ToString();
      }
      private set
      {
        SettingScope = SettingScope.Parse<SettingScope>(value);
      }
    }

    public string Value { get; set; }

    //[JsonIgnore]
    //[NotMapped]
    //public bool ValueBool { get { return Convert.ToBoolean(Value, CultureInfo.InvariantCulture); } }

    //[JsonIgnore]
    //[NotMapped]
    //public int ValueInt { get { return Convert.ToInt32(Value, CultureInfo.InvariantCulture); } }

    //[JsonIgnore]
    //[NotMapped]
    //public double ValueDouble { get { return Convert.ToDouble(Value, CultureInfo.InvariantCulture); } }

    //[JsonIgnore]
    //[NotMapped]
    //public JObject ValueJSON { get { return new JObject(Value); } }

  }
}
