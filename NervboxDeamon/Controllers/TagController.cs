using System;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.DbModels;
using NervboxDeamon.Models.View;

namespace NervboxDeamon.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class TagController : NervboxBaseController<TagController>
    {
        /// <summary>
        /// GET /api/tags - Alle Tags mit Sound-Count (public)
        /// </summary>
        [HttpGet]
        public IActionResult GetAllTags()
        {
            try
            {
                var tags = this.DbContext.Tags
                    .Select(t => new
                    {
                        t.Id,
                        t.Name,
                        t.Color,
                        t.IsPinned,
                        SoundCount = t.SoundTags.Count()
                    })
                    .OrderByDescending(t => t.IsPinned)
                    .ThenBy(t => t.Name)
                    .ToList();

                return Ok(tags);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// POST /api/tags - Neuen Tag erstellen (Admin only)
        /// </summary>
        [HttpPost]
        [Authorize(Roles = "admin")]
        public IActionResult CreateTag([FromBody] TagCreateModel model)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(model?.Name))
                {
                    return BadRequest(new { Error = "Tag name is required" });
                }

                var normalizedName = model.Name.Trim().ToLowerInvariant();

                // Check if tag already exists
                var existingTag = this.DbContext.Tags.FirstOrDefault(t => t.Name == normalizedName);
                if (existingTag != null)
                {
                    return Conflict(new { Error = "Tag already exists", Tag = existingTag });
                }

                var tag = new Tag
                {
                    Name = normalizedName,
                    Color = string.IsNullOrWhiteSpace(model.Color) ? "#9333ea" : model.Color,
                    IsPinned = model.IsPinned
                };
                this.DbContext.Tags.Add(tag);
                this.DbContext.SaveChanges();

                return Ok(new
                {
                    tag.Id,
                    tag.Name,
                    tag.Color,
                    tag.IsPinned,
                    SoundCount = 0
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// PUT /api/tags/{id} - Tag umbenennen (Admin only)
        /// </summary>
        [HttpPut("{id}")]
        [Authorize(Roles = "admin")]
        public IActionResult UpdateTag(int id, [FromBody] TagUpdateModel model)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(model?.Name))
                {
                    return BadRequest(new { Error = "Tag name is required" });
                }

                var tag = this.DbContext.Tags.FirstOrDefault(t => t.Id == id);
                if (tag == null)
                {
                    return NotFound(new { Error = "Tag not found" });
                }

                var normalizedName = model.Name.Trim().ToLowerInvariant();

                // Check if another tag with same name exists
                var existingTag = this.DbContext.Tags.FirstOrDefault(t => t.Name == normalizedName && t.Id != id);
                if (existingTag != null)
                {
                    return Conflict(new { Error = "A tag with this name already exists" });
                }

                tag.Name = normalizedName;
                if (!string.IsNullOrWhiteSpace(model.Color))
                {
                    tag.Color = model.Color;
                }
                if (model.IsPinned.HasValue)
                {
                    tag.IsPinned = model.IsPinned.Value;
                }
                this.DbContext.SaveChanges();

                return Ok(new
                {
                    tag.Id,
                    tag.Name,
                    tag.Color,
                    tag.IsPinned,
                    SoundCount = tag.SoundTags?.Count ?? 0
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// DELETE /api/tags/{id} - Tag löschen (Admin only)
        /// </summary>
        [HttpDelete("{id}")]
        [Authorize(Roles = "admin")]
        public IActionResult DeleteTag(int id)
        {
            try
            {
                var tag = this.DbContext.Tags.FirstOrDefault(t => t.Id == id);
                if (tag == null)
                {
                    return NotFound(new { Error = "Tag not found" });
                }

                // Remove all SoundTag associations first
                var soundTags = this.DbContext.SoundTags.Where(st => st.TagId == id).ToList();
                this.DbContext.SoundTags.RemoveRange(soundTags);

                // Then remove the tag
                this.DbContext.Tags.Remove(tag);
                this.DbContext.SaveChanges();

                return Ok(new { Message = "Tag deleted", RemovedFromSounds = soundTags.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }
    }
}
