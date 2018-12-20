using Microsoft.EntityFrameworkCore.Migrations;

namespace NervboxDeamon.Migrations
{
    public partial class Sounds : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Sounds",
                columns: table => new
                {
                    hash = table.Column<string>(nullable: false),
                    fileName = table.Column<string>(nullable: true),
                    allowed = table.Column<bool>(nullable: false),
                    valid = table.Column<bool>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sounds", x => x.hash);
                });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Sounds");
        }
    }
}
