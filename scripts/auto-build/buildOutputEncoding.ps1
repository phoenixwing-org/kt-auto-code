# license     MIT
# Mixed UTF-8 / legacy Windows build-output decoder.

if (-not ('BuildOutputTextPump' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

public static class BuildOutputTextPump
{
    public static void Copy(Stream input, TextWriter log, int fallbackCodePage)
    {
        Encoding utf8 = new UTF8Encoding(false, true);
        Encoding fallback = Encoding.GetEncoding(fallbackCodePage);
        byte[] buffer = new byte[8192];
        List<byte> line = new List<byte>(512);
        int count;

        while ((count = input.Read(buffer, 0, buffer.Length)) > 0)
        {
            for (int index = 0; index < count; index++)
            {
                byte value = buffer[index];
                if (value == 10)
                {
                    WriteLine(line, utf8, fallback, log);
                    line.Clear();
                }
                else
                {
                    line.Add(value);
                }
            }
        }

        if (line.Count > 0)
        {
            WriteLine(line, utf8, fallback, log);
        }
    }

    private static void WriteLine(List<byte> line, Encoding utf8, Encoding fallback, TextWriter log)
    {
        if (line.Count > 0 && line[line.Count - 1] == 13)
        {
            line.RemoveAt(line.Count - 1);
        }

        byte[] bytes = line.ToArray();
        string text;
        try
        {
            text = utf8.GetString(bytes);
        }
        catch (DecoderFallbackException)
        {
            text = fallback.GetString(bytes);
        }

        Console.WriteLine(text);
        if (log != null)
        {
            log.WriteLine(text);
        }
    }
}
'@
}

function Copy-BuildOutputText {
    param(
        [Parameter(Mandatory)]
        [System.IO.Stream]$InputStream,
        [AllowNull()]
        [System.IO.TextWriter]$LogWriter = $null,
        [Parameter(Mandatory)]
        [int]$FallbackCodePage
    )

    [BuildOutputTextPump]::Copy($InputStream, $LogWriter, $FallbackCodePage)
}
