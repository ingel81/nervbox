@ECHO OFF

ECHO #### Cleaning Release...
	set Releasefolder="%~dp0release"
	cd /d %Releasefolder%
	for /F "delims=" %%i in ('dir /b') do @IF EXIST "%%i" (del "%%i" /s/q)
	for /F "delims=" %%i in ('dir /b') do @IF EXIST "%%i" (rmdir "%%i" /s/q || del "%%i" /s/q)
	ECHO #### Cleaning Release...done

ECHO #### Publishing NervboxDeamon...
	set deamonFolder="%~dp0NervboxDeamon"
	cd /d %deamonFolder%
	dotnet publish -o %Releasefolder% --self-contained -r linux-arm
	ECHO #### Publishing NervboxDeamon...done

ECHO ### COPY External Libs...
	set libsFolder="%~dp0NervboxDeamon\libs"
	xcopy %libsFolder%\*.* %Releasefolder% /sy
	ECHO ### COPY External Libs...done
	
ECHO #### Creating wwwroot folder...
	set wwwrootFolder="%~dp0release\wwwroot"
	mkdir %wwwrootFolder%
	ECHO #### Creating wwwroot folder...done

ECHO #### Publish NervboxUI...
	set uiFolder="%~dp0NervboxUI"
	cd /d %uiFolder%
	call npm run build:prod
	ECHO #### Publish NervboxUI...done

ECHO #### Copy NervboxUI to release\wwwroot...
	xcopy %uiFolder%\dist\*.* %wwwrootFolder% /sy
	ECHO #### Copy NervboxUI to release\wwwroot...done

ECHO #### Copy DOCS to release...
	set docsSourceFolder="%~dp0NervboxDeamon\docs"
	set docsTargetFolder="%~dp0release\docs"
	mkdir %docsTargetFolder%
	xcopy %docsSourceFolder%\*.* %docsTargetFolder% /sy
	ECHO #### Copy DOCS to release...done		
	
cd /d %~dp0

ECHO #### Deploy to rasp...
	"c:\Program Files (x86)\WinSCP\WinSCP.exe" /log="WinSCP.log" /ini=nul /script="deploy.winscpscript
	ECHO #### Deploy to rasp...done

PAUSE