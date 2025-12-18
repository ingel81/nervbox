using System;
using System.IO;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.Models.Settings;
using NervboxDeamon.Models.View;
using NervboxDeamon.Services;

namespace NervboxDeamon.Controllers
{
  [Route("api/[controller]")]
  [ApiController]
  public class SoundController : NervboxBaseController<SoundController>
  {
    //injected
    private IWebHostEnvironment Environment { get; }
    private ISoundService SoundService { get; }
    private IHttpContextAccessor Accessor { get; }
    private AppSettings AppSettings { get; }

    public SoundController(ISoundService soundService, IWebHostEnvironment environment, IHttpContextAccessor accessor, IOptions<AppSettings> appSettings)
    {
      this.SoundService = soundService;
      this.Environment = environment;
      this.Accessor = accessor;
      this.AppSettings = appSettings.Value;
    }

    [HttpGet]
    public IActionResult GetAllSounds()
    {
      var sounds = this.DbContext.Sounds
        .Where(s => s.Enabled)
        .Select(s => new
        {
          s.Hash,
          s.Name,
          s.FileName,
          s.SizeBytes,
          s.DurationMs,
          s.Enabled,
          s.CreatedAt,
          Tags = s.SoundTags.Select(st => st.Tag.Name).ToList(),
          PlayCount = s.Usages.Count()
        })
        .ToList();

      return Ok(sounds);
    }

    [HttpGet]
    [Route("{soundId}/play")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public IActionResult PlaySound(string soundId)
    {
      try
      {
        this.SoundService.PlaySound(soundId, this.UserId);
        return Ok();
      }
      catch (Exception ex)
      {
        return StatusCode(500, new
        {
          Error = ex.Message,
          Stacktrace = ex.StackTrace
        });
      }
    }

    [HttpGet]
    [Route("statistics/topusers")]
    public IActionResult TopUsers()
    {
      try
      {
        return Ok(this.DbContext.SoundUsages.GroupBy(g => new { id = g.User.Id, name = g.User.Username }).Select(g => new
        {
          PlayedById = g.Key.id,
          Name = g.Key.name,
          Count = g.Count()
        }).OrderByDescending(g => g.Count).Take(25));
      }
      catch (Exception ex)
      {
        return StatusCode(500, new
        {
          Error = ex.Message,
          Stacktrace = ex.StackTrace
        });
      }
    }

    [HttpGet]
    [Route("statistics/topsounds")]
    public IActionResult TopSounds()
    {
      try
      {

        var affe = this.DbContext.SoundUsages.Join(this.DbContext.Sounds, outer => outer.SoundHash, inner => inner.Hash, (usages, sounds) => new { usages, sounds }).GroupBy((a) => new { hash = a.usages.SoundHash, fileName = a.sounds.FileName }).Select(a => new
        {
          Hash = a.Key.hash,
          Name = a.Key.fileName,
          Count = a.Count()
        }).OrderByDescending(a => a.Count).Take(25);


        return Ok(affe);
      }
      catch (Exception ex)
      {
        return StatusCode(500, new
        {
          Error = ex.Message,
          Stacktrace = ex.StackTrace
        });
      }
    }

    [HttpGet]
    [Route("killAll")]
    public IActionResult KillAll()
    {
      this.SoundService.KillAll();
      return Ok();
    }

    [HttpGet]
    [Route("{hash}/file")]
    public IActionResult GetSoundFile(string hash)
    {
      try
      {
        var sound = this.DbContext.Sounds.FirstOrDefault(s => s.Hash == hash);
        if (sound == null)
        {
          return NotFound(new { Error = "Sound not found" });
        }

        var filePath = Path.GetFullPath(Path.Combine(AppSettings.SoundPath, sound.FileName));
        if (!System.IO.File.Exists(filePath))
        {
          return NotFound(new { Error = "File not found" });
        }

        var contentType = "audio/mpeg";
        if (sound.FileName.EndsWith(".wav", StringComparison.OrdinalIgnoreCase))
        {
          contentType = "audio/wav";
        }
        else if (sound.FileName.EndsWith(".ogg", StringComparison.OrdinalIgnoreCase))
        {
          contentType = "audio/ogg";
        }

        return PhysicalFile(filePath, contentType, sound.FileName);
      }
      catch (Exception ex)
      {
        return StatusCode(500, new { Error = ex.Message });
      }
    }

    [HttpPost]
    [Route("upload")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public IActionResult UploadSound([FromForm] IFormFile file, [FromForm] string tags)
    {
      try
      {
        if (file == null || file.Length == 0)
        {
          return BadRequest(new { Error = "No file provided" });
        }

        var allowedExtensions = new[] { ".mp3", ".wav", ".ogg" };
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!allowedExtensions.Contains(extension))
        {
          return BadRequest(new { Error = "Invalid file type. Allowed: mp3, wav, ogg" });
        }

        // Use original filename (sanitized), with collision handling
        var originalName = Path.GetFileNameWithoutExtension(file.FileName);
        var sanitizedName = string.Join("_", originalName.Split(Path.GetInvalidFileNameChars()));
        var fileName = $"{sanitizedName}{extension}";
        var filePath = Path.Combine(AppSettings.SoundPath, fileName);

        // Handle filename collisions by appending number
        var counter = 1;
        while (System.IO.File.Exists(filePath))
        {
          fileName = $"{sanitizedName}_{counter}{extension}";
          filePath = Path.Combine(AppSettings.SoundPath, fileName);
          counter++;
        }

        // Save file
        using (var stream = new FileStream(filePath, FileMode.Create))
        {
          file.CopyTo(stream);
        }

        // Calculate hash and duration using shared helper
        string hash = Services.SoundHelper.GetFileHash(filePath);
        int durationMs = Services.SoundHelper.GetDurationMs(filePath);

        // Check if sound with this hash already exists
        var existingSound = this.DbContext.Sounds.FirstOrDefault(s => s.Hash == hash);
        if (existingSound != null)
        {
          System.IO.File.Delete(filePath);
          return Conflict(new { Error = "Sound already exists", Hash = hash });
        }

        // Create sound entry
        var sound = new DbModels.Sound
        {
          Hash = hash,
          Name = Path.GetFileNameWithoutExtension(file.FileName),
          FileName = fileName,
          SizeBytes = file.Length,
          DurationMs = durationMs,
          Enabled = true,
          CreatedAt = DateTime.UtcNow
        };

        this.DbContext.Sounds.Add(sound);

        // Add tags
        if (!string.IsNullOrEmpty(tags))
        {
          var tagList = tags.Split(',').Select(t => t.Trim().ToLowerInvariant()).Where(t => !string.IsNullOrEmpty(t));
          foreach (var tagName in tagList)
          {
            var tag = this.DbContext.Tags.FirstOrDefault(t => t.Name == tagName);
            if (tag == null)
            {
              tag = new DbModels.Tag { Name = tagName };
              this.DbContext.Tags.Add(tag);
              this.DbContext.SaveChanges();
            }

            this.DbContext.SoundTags.Add(new DbModels.SoundTag
            {
              SoundHash = hash,
              TagId = tag.Id
            });
          }
        }

        this.DbContext.SaveChanges();

        // Add to SoundService cache for immediate playback
        this.SoundService.AddSoundToCache(sound);

        return Ok(new
        {
          sound.Hash,
          sound.Name,
          sound.FileName,
          sound.SizeBytes,
          Tags = tags?.Split(',').Select(t => t.Trim()).ToList() ?? new System.Collections.Generic.List<string>()
        });
      }
      catch (Exception ex)
      {
        return StatusCode(500, new { Error = ex.Message, Stacktrace = ex.StackTrace });
      }
    }

    /// <summary>
    /// PUT /api/sound/{hash} - Sound bearbeiten (Admin only)
    /// </summary>
    [HttpPut("{hash}")]
    [Authorize(Roles = "admin")]
    public IActionResult UpdateSound(string hash, [FromBody] SoundUpdateModel model)
    {
      try
      {
        var sound = this.DbContext.Sounds.FirstOrDefault(s => s.Hash == hash);
        if (sound == null)
        {
          return NotFound(new { Error = "Sound not found" });
        }

        // Update name if provided
        if (!string.IsNullOrWhiteSpace(model.Name))
        {
          sound.Name = model.Name.Trim();
        }

        // Update enabled status if provided
        if (model.Enabled.HasValue)
        {
          sound.Enabled = model.Enabled.Value;
          this.SoundService.UpdateSoundEnabledStatus(hash, model.Enabled.Value);
        }

        // Update tags if provided
        if (model.Tags != null)
        {
          // Remove existing tags
          var existingSoundTags = this.DbContext.SoundTags.Where(st => st.SoundHash == hash).ToList();
          this.DbContext.SoundTags.RemoveRange(existingSoundTags);

          // Add new tags
          foreach (var tagName in model.Tags.Select(t => t.Trim().ToLowerInvariant()).Where(t => !string.IsNullOrEmpty(t)))
          {
            var tag = this.DbContext.Tags.FirstOrDefault(t => t.Name == tagName);
            if (tag == null)
            {
              tag = new DbModels.Tag { Name = tagName };
              this.DbContext.Tags.Add(tag);
              this.DbContext.SaveChanges();
            }

            this.DbContext.SoundTags.Add(new DbModels.SoundTag
            {
              SoundHash = hash,
              TagId = tag.Id
            });
          }
        }

        this.DbContext.SaveChanges();

        return Ok(new
        {
          sound.Hash,
          sound.Name,
          sound.FileName,
          sound.SizeBytes,
          sound.DurationMs,
          sound.Enabled,
          sound.CreatedAt,
          Tags = this.DbContext.SoundTags.Where(st => st.SoundHash == hash).Select(st => st.Tag.Name).ToList(),
          PlayCount = sound.Usages?.Count ?? 0
        });
      }
      catch (Exception ex)
      {
        return StatusCode(500, new { Error = ex.Message });
      }
    }

    /// <summary>
    /// PUT /api/sound/{hash}/toggle - Enabled/Disabled toggle (Admin only)
    /// </summary>
    [HttpPut("{hash}/toggle")]
    [Authorize(Roles = "admin")]
    public IActionResult ToggleSoundEnabled(string hash)
    {
      try
      {
        var sound = this.DbContext.Sounds.FirstOrDefault(s => s.Hash == hash);
        if (sound == null)
        {
          return NotFound(new { Error = "Sound not found" });
        }

        sound.Enabled = !sound.Enabled;
        this.DbContext.SaveChanges();

        this.SoundService.UpdateSoundEnabledStatus(hash, sound.Enabled);

        return Ok(new
        {
          sound.Hash,
          sound.Enabled
        });
      }
      catch (Exception ex)
      {
        return StatusCode(500, new { Error = ex.Message });
      }
    }

    /// <summary>
    /// DELETE /api/sound/{hash} - Sound löschen (Admin only)
    /// </summary>
    [HttpDelete("{hash}")]
    [Authorize(Roles = "admin")]
    public IActionResult DeleteSound(string hash)
    {
      try
      {
        var sound = this.DbContext.Sounds.FirstOrDefault(s => s.Hash == hash);
        if (sound == null)
        {
          return NotFound(new { Error = "Sound not found" });
        }

        // Remove file from disk
        var filePath = Path.GetFullPath(Path.Combine(AppSettings.SoundPath, sound.FileName));
        if (System.IO.File.Exists(filePath))
        {
          System.IO.File.Delete(filePath);
        }

        // Remove from cache
        this.SoundService.RemoveSoundFromCache(hash);

        // Remove SoundTags
        var soundTags = this.DbContext.SoundTags.Where(st => st.SoundHash == hash).ToList();
        this.DbContext.SoundTags.RemoveRange(soundTags);

        // Remove SoundUsages
        var usages = this.DbContext.SoundUsages.Where(u => u.SoundHash == hash).ToList();
        this.DbContext.SoundUsages.RemoveRange(usages);

        // Remove Sound
        this.DbContext.Sounds.Remove(sound);
        this.DbContext.SaveChanges();

        return Ok(new { Message = "Sound deleted", Hash = hash });
      }
      catch (Exception ex)
      {
        return StatusCode(500, new { Error = ex.Message });
      }
    }

    /// <summary>
    /// GET /api/sound/all - Alle Sounds inkl. disabled (Admin only)
    /// </summary>
    [HttpGet("all")]
    [Authorize(Roles = "admin")]
    public IActionResult GetAllSoundsIncludingDisabled()
    {
      var sounds = this.DbContext.Sounds
        .Select(s => new
        {
          s.Hash,
          s.Name,
          s.FileName,
          s.SizeBytes,
          s.DurationMs,
          s.Enabled,
          s.CreatedAt,
          Tags = s.SoundTags.Select(st => st.Tag.Name).ToList(),
          PlayCount = s.Usages.Count()
        })
        .ToList();

      return Ok(sounds);
    }

    /// <summary>
    /// GET /api/sound/statistics/topfavorites - Top 25 meistfavorisierte Sounds
    /// </summary>
    [HttpGet("statistics/topfavorites")]
    public IActionResult TopFavorites()
    {
      try
      {
        var topFavorites = this.DbContext.UserFavorites
          .Join(this.DbContext.Sounds, fav => fav.SoundHash, sound => sound.Hash, (fav, sound) => new { fav, sound })
          .GroupBy(x => new { x.sound.Hash, x.sound.Name })
          .Select(g => new
          {
            Hash = g.Key.Hash,
            Name = g.Key.Name,
            Count = g.Count()
          })
          .OrderByDescending(x => x.Count)
          .Take(25)
          .ToList();

        return Ok(topFavorites);
      }
      catch (Exception ex)
      {
        return StatusCode(500, new
        {
          Error = ex.Message,
          Stacktrace = ex.StackTrace
        });
      }
    }

    /// <summary>
    /// GET /api/sound/favorites - Alle Favoriten des eingeloggten Users
    /// </summary>
    [HttpGet("favorites")]
    [Authorize]
    public IActionResult GetFavorites()
    {
      var favoriteHashes = this.DbContext.UserFavorites
        .Where(uf => uf.UserId == this.UserId)
        .Select(uf => uf.SoundHash)
        .ToList();

      return Ok(favoriteHashes);
    }

    /// <summary>
    /// POST /api/sound/{hash}/favorite - Sound als Favorit hinzufügen
    /// </summary>
    [HttpPost("{hash}/favorite")]
    [Authorize]
    public IActionResult AddFavorite(string hash)
    {
      try
      {
        var sound = this.DbContext.Sounds.FirstOrDefault(s => s.Hash == hash);
        if (sound == null)
        {
          return NotFound(new { Error = "Sound not found" });
        }

        var existingFavorite = this.DbContext.UserFavorites
          .FirstOrDefault(uf => uf.UserId == this.UserId && uf.SoundHash == hash);

        if (existingFavorite != null)
        {
          return Ok(new { Message = "Already a favorite", Hash = hash });
        }

        this.DbContext.UserFavorites.Add(new DbModels.UserFavorite
        {
          UserId = this.UserId,
          SoundHash = hash,
          CreatedAt = DateTime.UtcNow
        });

        this.DbContext.SaveChanges();

        return Ok(new { Message = "Added to favorites", Hash = hash });
      }
      catch (Exception ex)
      {
        return StatusCode(500, new { Error = ex.Message });
      }
    }

    /// <summary>
    /// DELETE /api/sound/{hash}/favorite - Favorit entfernen
    /// </summary>
    [HttpDelete("{hash}/favorite")]
    [Authorize]
    public IActionResult RemoveFavorite(string hash)
    {
      try
      {
        var favorite = this.DbContext.UserFavorites
          .FirstOrDefault(uf => uf.UserId == this.UserId && uf.SoundHash == hash);

        if (favorite == null)
        {
          return NotFound(new { Error = "Favorite not found" });
        }

        this.DbContext.UserFavorites.Remove(favorite);
        this.DbContext.SaveChanges();

        return Ok(new { Message = "Removed from favorites", Hash = hash });
      }
      catch (Exception ex)
      {
        return StatusCode(500, new { Error = ex.Message });
      }
    }
  }
}