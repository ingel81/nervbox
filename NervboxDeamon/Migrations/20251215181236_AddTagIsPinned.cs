using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NervboxDeamon.Migrations
{
    /// <inheritdoc />
    public partial class AddTagIsPinned : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_pinned",
                table: "tags",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "is_pinned",
                table: "tags");
        }
    }
}
