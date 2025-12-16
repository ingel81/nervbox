using System;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using NervboxDeamon.Models.Settings;

namespace NervboxDeamon.Services
{
  public interface IGiphyService
  {
    Task<string> SearchAsync(string query, int limit = 25, int offset = 0);
    Task<string> TrendingAsync(int limit = 25, int offset = 0);
    bool IsConfigured { get; }
  }

  public class GiphyService : IGiphyService
  {
    private readonly ILogger<GiphyService> _logger;
    private readonly HttpClient _httpClient;
    private readonly string[] _apiKeys;
    private int _keyIndex = 0;
    private readonly object _keyLock = new object();

    private const string GiphyApiBase = "https://api.giphy.com/v1/gifs";

    public bool IsConfigured => _apiKeys.Length > 0;

    public GiphyService(ILogger<GiphyService> logger, IConfiguration configuration)
    {
      _logger = logger;
      _httpClient = new HttpClient();
      _httpClient.Timeout = TimeSpan.FromSeconds(10);

      var giphySettings = configuration.GetSection("Giphy").Get<GiphySettings>();
      _apiKeys = giphySettings?.ApiKeys ?? Array.Empty<string>();

      if (_apiKeys.Length > 0)
      {
        _logger.LogInformation("GiphyService initialized with {Count} API keys", _apiKeys.Length);
      }
      else
      {
        _logger.LogWarning("GiphyService: No API keys configured. Add keys to appsettings.Local.json");
      }
    }

    private string GetNextKey()
    {
      lock (_keyLock)
      {
        var key = _apiKeys[_keyIndex];
        _keyIndex = (_keyIndex + 1) % _apiKeys.Length;
        return key;
      }
    }

    public async Task<string> SearchAsync(string query, int limit = 25, int offset = 0)
    {
      if (!IsConfigured)
      {
        throw new InvalidOperationException("Giphy API is not configured");
      }

      var apiKey = GetNextKey();
      var url = $"{GiphyApiBase}/search?api_key={apiKey}&q={Uri.EscapeDataString(query)}&limit={limit}&offset={offset}&rating=r&lang=de";

      _logger.LogDebug("Giphy search: {Query} (limit={Limit}, offset={Offset})", query, limit, offset);

      var response = await _httpClient.GetAsync(url);
      response.EnsureSuccessStatusCode();

      return await response.Content.ReadAsStringAsync();
    }

    public async Task<string> TrendingAsync(int limit = 25, int offset = 0)
    {
      if (!IsConfigured)
      {
        throw new InvalidOperationException("Giphy API is not configured");
      }

      var apiKey = GetNextKey();
      var url = $"{GiphyApiBase}/trending?api_key={apiKey}&limit={limit}&offset={offset}&rating=r";

      _logger.LogDebug("Giphy trending (limit={Limit}, offset={Offset})", limit, offset);

      var response = await _httpClient.GetAsync(url);
      response.EnsureSuccessStatusCode();

      return await response.Content.ReadAsStringAsync();
    }
  }
}
