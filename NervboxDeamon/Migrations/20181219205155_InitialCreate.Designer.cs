﻿// <auto-generated />
using System;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using NervboxDeamon;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

namespace NervboxDeamon.Migrations
{
    [DbContext(typeof(NervboxDBContext))]
    [Migration("20181219205155_InitialCreate")]
    partial class InitialCreate
    {
        protected override void BuildTargetModel(ModelBuilder modelBuilder)
        {
#pragma warning disable 612, 618
            modelBuilder
                .HasAnnotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.SerialColumn)
                .HasAnnotation("ProductVersion", "2.2.0-rtm-35687")
                .HasAnnotation("Relational:MaxIdentifierLength", 63);

            modelBuilder.Entity("NervboxDeamon.DbModels.Record", b =>
                {
                    b.Property<DateTime>("Time")
                        .HasColumnName("time");

                    b.Property<double>("Acceleration")
                        .HasColumnName("acc");

                    b.Property<double>("Current")
                        .HasColumnName("cur");

                    b.Property<long>("Cycles")
                        .HasColumnName("cycl");

                    b.Property<double>("Temperature1")
                        .HasColumnName("temp_1");

                    b.Property<double>("Temperature2")
                        .HasColumnName("temp_2");

                    b.Property<double>("Temperature3")
                        .HasColumnName("temp_3");

                    b.Property<double>("TemperatureB")
                        .HasColumnName("temp_b");

                    b.HasKey("Time");

                    b.ToTable("records");
                });

            modelBuilder.Entity("NervboxDeamon.DbModels.Setting", b =>
                {
                    b.Property<string>("Key")
                        .ValueGeneratedOnAdd();

                    b.Property<string>("Description")
                        .IsRequired();

                    b.Property<string>("SettingScopeString")
                        .IsRequired()
                        .HasColumnName("SettingScope")
                        .HasMaxLength(50);

                    b.Property<string>("SettingTypeString")
                        .IsRequired()
                        .HasColumnName("SettingType")
                        .HasMaxLength(50);

                    b.Property<string>("Value");

                    b.HasKey("Key");

                    b.ToTable("settings");
                });
#pragma warning restore 612, 618
        }
    }
}
