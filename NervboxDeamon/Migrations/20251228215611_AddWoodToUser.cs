using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NervboxDeamon.Migrations
{
    /// <inheritdoc />
    public partial class AddWoodToUser : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "wood",
                table: "users",
                type: "INTEGER",
                nullable: false,
                defaultValue: 10);

            // Set initial 10 wood for all existing users
            migrationBuilder.Sql("UPDATE users SET wood = 10");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "wood",
                table: "users");
        }
    }
}
